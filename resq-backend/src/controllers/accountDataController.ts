import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../prisma';

const vehicleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  plate: z.string().trim().min(4).max(16),
  vin: z.union([z.string().trim().min(5).max(32), z.null()]).optional(),
  color: z.union([z.string().trim().max(40), z.null()]).optional(),
  isDefault: z.boolean().optional(),
}).strict();

const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(9).max(16),
  relation: z.string().trim().max(40).optional(),
  shareLocation: z.boolean().optional(),
}).strict();

const placeSchema = z.object({
  type: z.enum(['home', 'work', 'other']).optional(),
  title: z.string().trim().min(1).max(80),
  address: z.string().trim().min(1).max(300),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
}).strict().refine((value) => value.latitude == null === (value.longitude == null), {
  message: 'latitude và longitude phải cùng được cung cấp',
});

const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const getId = (req: Request) => {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] : value;
};
const badInput = (res: Response, parsed: { success: false; error: z.ZodError }) =>
  res.status(400).json({ message: 'Dữ liệu không hợp lệ', errors: parsed.error.flatten().fieldErrors });

export const listVehicles = async (req: Request, res: Response) => {
  try {
    const data = await db.orm.public.Vehicle.where({ userId: req.auth!.userId })
      .orderBy((vehicle) => vehicle.createdAt.desc())
      .all();
    return res.json({ data });
  } catch (error) {
    console.error('listVehicles failed:', error);
    return res.status(500).json({ message: 'Không thể tải danh sách phương tiện' });
  }
};

export const createVehicle = async (req: Request, res: Response) => {
  const parsed = vehicleSchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, parsed);
  try {
    const userId = req.auth!.userId;
    const vehicles = await db.orm.public.Vehicle.where({ userId }).all();
    if (vehicles.length >= 10) return res.status(409).json({ message: 'Tối đa 10 phương tiện trên mỗi tài khoản' });
    let created = await db.orm.public.Vehicle.create({
      ...parsed.data,
      vin: parsed.data.vin || null,
      color: parsed.data.color || null,
      isDefault: parsed.data.isDefault ?? vehicles.length === 0,
      userId,
    });
    if (created.isDefault) {
      await db.transaction(async (tx) => {
        await tx.orm.public.Vehicle.where({ userId }).update({ isDefault: false });
        await tx.orm.public.Vehicle.where({ id: created.id, userId }).update({ isDefault: true });
      });
      created = (await db.orm.public.Vehicle.where({ id: created.id, userId }).first())!;
    }
    return res.status(201).json({ data: created });
  } catch (error) {
    console.error('createVehicle failed:', error);
    return res.status(409).json({ message: 'Biển số này đã có trong danh sách phương tiện' });
  }
};

export const updateVehicle = async (req: Request, res: Response) => {
  const id = getId(req);
  if (!validId(id)) return res.status(400).json({ message: 'ID phương tiện không hợp lệ' });
  const parsed = vehicleSchema.partial().safeParse(req.body);
  if (!parsed.success) return badInput(res, parsed);
  if (!Object.keys(parsed.data).length) return res.status(400).json({ message: 'Cần ít nhất một trường để cập nhật' });
  try {
    const userId = req.auth!.userId;
    const current = await db.orm.public.Vehicle.where({ id, userId }).first();
    if (!current) return res.status(404).json({ message: 'Không tìm thấy phương tiện' });
    const { isDefault, ...changes } = parsed.data;
    const updateData = {
      ...changes,
      ...(changes.vin !== undefined ? { vin: changes.vin || null } : {}),
      ...(changes.color !== undefined ? { color: changes.color || null } : {}),
      ...(isDefault !== undefined ? { isDefault } : {}),
    };
    const updated = isDefault
      ? await db.transaction(async (tx) => {
          await tx.orm.public.Vehicle.where({ userId }).update({ isDefault: false });
          return tx.orm.public.Vehicle.where({ id: current.id, userId }).update({ ...updateData, isDefault: true });
        })
      : await db.orm.public.Vehicle.where({ id: current.id, userId }).update(updateData);
    return res.json({ data: updated });
  } catch (error) {
    console.error('updateVehicle failed:', error);
    return res.status(409).json({ message: 'Biển số này đã được sử dụng' });
  }
};

export const deleteVehicle = async (req: Request, res: Response) => {
  const id = getId(req);
  if (!validId(id)) return res.status(400).json({ message: 'ID phương tiện không hợp lệ' });
  try {
    const userId = req.auth!.userId;
    const vehicle = await db.orm.public.Vehicle.where({ id, userId }).first();
    if (!vehicle) return res.status(404).json({ message: 'Không tìm thấy phương tiện' });
    if (vehicle.isDefault) {
      await db.transaction(async (tx) => {
        await tx.orm.public.Vehicle.where({ id: vehicle.id, userId }).delete();
        const next = await tx.orm.public.Vehicle.where({ userId }).orderBy((item) => item.createdAt.asc()).first();
        if (next) await tx.orm.public.Vehicle.where({ id: next.id, userId }).update({ isDefault: true });
      });
    } else {
      await db.orm.public.Vehicle.where({ id: vehicle.id, userId }).delete();
    }
    return res.status(204).send();
  } catch (error) {
    console.error('deleteVehicle failed:', error);
    return res.status(500).json({ message: 'Không thể xóa phương tiện' });
  }
};

export const listEmergencyContacts = async (req: Request, res: Response) => {
  try {
    const data = await db.orm.public.EmergencyContact.where({ userId: req.auth!.userId })
      .orderBy((contact) => contact.createdAt.asc())
      .all();
    return res.json({ data });
  } catch (error) {
    console.error('listEmergencyContacts failed:', error);
    return res.status(500).json({ message: 'Không thể tải danh bạ khẩn cấp' });
  }
};

export const createEmergencyContact = async (req: Request, res: Response) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, parsed);
  try {
    const userId = req.auth!.userId;
    const contacts = await db.orm.public.EmergencyContact.where({ userId }).all();
    if (contacts.length >= 5) return res.status(409).json({ message: 'Tối đa 5 người liên hệ khẩn cấp' });
    const phone = parsed.data.phone.replace(/[\s().-]/g, '');
    const data = await db.orm.public.EmergencyContact.create({
      ...parsed.data,
      phone,
      relation: parsed.data.relation || 'Người thân',
      shareLocation: parsed.data.shareLocation ?? true,
      userId,
    });
    return res.status(201).json({ data });
  } catch (error) {
    console.error('createEmergencyContact failed:', error);
    return res.status(409).json({ message: 'Số điện thoại này đã có trong danh bạ' });
  }
};

export const updateEmergencyContact = async (req: Request, res: Response) => {
  const id = getId(req);
  if (!validId(id)) return res.status(400).json({ message: 'ID người liên hệ không hợp lệ' });
  const parsed = contactSchema.partial().safeParse(req.body);
  if (!parsed.success) return badInput(res, parsed);
  if (!Object.keys(parsed.data).length) return res.status(400).json({ message: 'Cần ít nhất một trường để cập nhật' });
  try {
    const userId = req.auth!.userId;
    const contact = await db.orm.public.EmergencyContact.where({ id, userId }).first();
    if (!contact) return res.status(404).json({ message: 'Không tìm thấy người liên hệ' });
    const data = await db.orm.public.EmergencyContact.where({ id: contact.id, userId }).update({
      ...parsed.data,
      ...(parsed.data.phone ? { phone: parsed.data.phone.replace(/[\s().-]/g, '') } : {}),
    });
    return res.json({ data });
  } catch (error) {
    console.error('updateEmergencyContact failed:', error);
    return res.status(409).json({ message: 'Số điện thoại này đã có trong danh bạ' });
  }
};

export const deleteEmergencyContact = async (req: Request, res: Response) => {
  const id = getId(req);
  if (!validId(id)) return res.status(400).json({ message: 'ID người liên hệ không hợp lệ' });
  try {
    const result = await db.orm.public.EmergencyContact.where({ id, userId: req.auth!.userId }).delete();
    return res.status(204).send(result);
  } catch (error) {
    console.error('deleteEmergencyContact failed:', error);
    return res.status(500).json({ message: 'Không thể xóa người liên hệ' });
  }
};

export const listSavedPlaces = async (req: Request, res: Response) => {
  try {
    const data = await db.orm.public.SavedPlace.where({ userId: req.auth!.userId })
      .orderBy((place) => place.createdAt.desc())
      .all();
    return res.json({ data });
  } catch (error) {
    console.error('listSavedPlaces failed:', error);
    return res.status(500).json({ message: 'Không thể tải địa điểm đã lưu' });
  }
};

export const createSavedPlace = async (req: Request, res: Response) => {
  const parsed = placeSchema.safeParse(req.body);
  if (!parsed.success) return badInput(res, parsed);
  try {
    const userId = req.auth!.userId;
    const places = await db.orm.public.SavedPlace.where({ userId }).all();
    if (places.length >= 50) return res.status(409).json({ message: 'Tối đa 50 địa điểm đã lưu' });
    const data = await db.orm.public.SavedPlace.create({ ...parsed.data, type: parsed.data.type || 'other', userId });
    return res.status(201).json({ data });
  } catch (error) {
    console.error('createSavedPlace failed:', error);
    return res.status(500).json({ message: 'Không thể lưu địa điểm' });
  }
};

export const updateSavedPlace = async (req: Request, res: Response) => {
  const id = getId(req);
  if (!validId(id)) return res.status(400).json({ message: 'ID địa điểm không hợp lệ' });
  const parsed = placeSchema.partial().safeParse(req.body);
  if (!parsed.success) return badInput(res, parsed);
  if (!Object.keys(parsed.data).length) return res.status(400).json({ message: 'Cần ít nhất một trường để cập nhật' });
  try {
    const userId = req.auth!.userId;
    const place = await db.orm.public.SavedPlace.where({ id, userId }).first();
    if (!place) return res.status(404).json({ message: 'Không tìm thấy địa điểm' });
    const data = await db.orm.public.SavedPlace.where({ id: place.id, userId }).update(parsed.data);
    return res.json({ data });
  } catch (error) {
    console.error('updateSavedPlace failed:', error);
    return res.status(500).json({ message: 'Không thể cập nhật địa điểm' });
  }
};

export const deleteSavedPlace = async (req: Request, res: Response) => {
  const id = getId(req);
  if (!validId(id)) return res.status(400).json({ message: 'ID địa điểm không hợp lệ' });
  try {
    await db.orm.public.SavedPlace.where({ id, userId: req.auth!.userId }).delete();
    return res.status(204).send();
  } catch (error) {
    console.error('deleteSavedPlace failed:', error);
    return res.status(500).json({ message: 'Không thể xóa địa điểm' });
  }
};
