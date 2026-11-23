// useStoreEditor: tải + lưu MỘT cửa hàng (cửa hàng của tài khoản, hoặc một chi nhánh theo storeId) — dùng chung cho
// các màn sửa tách riêng (Thông tin · Ảnh · Vị trí · Giờ & dịch vụ). Mỗi màn chỉ lo đúng một việc.
import { useCallback, useEffect, useRef, useState } from 'react';
import { storeApi, type StoreProfile } from '../../services/api';
import { friendlyError } from '../account/accountLogic';

type Patch = Parameters<typeof storeApi.update>[0];

export function useStoreEditor(storeId: string | null | undefined) {
  const [store, setStore] = useState<StoreProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const s = storeId
        ? (await storeApi.branches()).find(x => x.id === storeId)
        : await storeApi.me();
      if (!s) throw new Error('Không tìm thấy cửa hàng / chi nhánh này');
      if (alive.current) setStore(s);
    } catch (e) {
      if (alive.current) setError(friendlyError(e));
    }
  }, [storeId]);
  useEffect(() => { void reload(); }, [reload]);

  /** Gộp kết quả server vào bản đang có (API ảnh trả hồ sơ không kèm isOwner / isMain). */
  const merge = useCallback((r: Partial<StoreProfile>) => setStore(cur => (cur ? { ...cur, ...r } : (r as StoreProfile))), []);

  const update = useCallback(async (p: Patch) => {
    const r = storeId ? await storeApi.updateBranch(storeId, p) : await storeApi.update(p);
    merge(r);
    return r;
  }, [storeId, merge]);
  const addImage = useCallback(async (data: string) => { merge(storeId ? await storeApi.addBranchImage(storeId, data) : await storeApi.addImage(data)); }, [storeId, merge]);
  const removeImage = useCallback(async (i: number) => { merge(storeId ? await storeApi.removeBranchImage(storeId, i) : await storeApi.removeImage(i)); }, [storeId, merge]);

  return { store, error, reload, update, addImage, removeImage, setStore: merge, owner: !!store?.isOwner };
}
