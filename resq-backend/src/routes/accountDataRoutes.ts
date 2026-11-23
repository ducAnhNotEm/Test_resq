import { Router } from 'express';
import {
  createEmergencyContact, createSavedPlace, createVehicle, deleteEmergencyContact,
  deleteSavedPlace, deleteVehicle, listEmergencyContacts, listSavedPlaces, listVehicles,
  updateEmergencyContact, updateSavedPlace, updateVehicle,
} from '../controllers/accountDataController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();
router.use(requireAuth);

router.get('/vehicles', listVehicles);
router.post('/vehicles', createVehicle);
router.patch('/vehicles/:id', updateVehicle);
router.delete('/vehicles/:id', deleteVehicle);

router.get('/emergency-contacts', listEmergencyContacts);
router.post('/emergency-contacts', createEmergencyContact);
router.patch('/emergency-contacts/:id', updateEmergencyContact);
router.delete('/emergency-contacts/:id', deleteEmergencyContact);

router.get('/saved-places', listSavedPlaces);
router.post('/saved-places', createSavedPlace);
router.patch('/saved-places/:id', updateSavedPlace);
router.delete('/saved-places/:id', deleteSavedPlace);

export default router;
