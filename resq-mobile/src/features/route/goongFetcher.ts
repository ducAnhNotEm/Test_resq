// goongFetcher.ts: lấy tuyến Goong Directions V2 QUA SERVER (/api/geo/directions).
// Key REST Goong không còn nằm trong app. KHÔNG có đường lui "tuyến giả":
// Goong lỗi → tracker báo lỗi + vẽ đường chim bay nét đứt, tài xế biết rõ là chưa có tuyến
// (bản cũ âm thầm trả tuyến mô phỏng — nguy hiểm: tài xế đi theo một con đường không tồn tại).
import type { Fetcher } from './routeTracker';
import { parseGoongDirections, validPoint } from './goongParse';
import { geoApi } from '../../services/api';

export { parseGoongDirections };

export const serverFetcher: Fetcher = async (from, to, vehicle, signal) => {
  if (!validPoint(from) || !validPoint(to)) throw new Error('Toạ độ không hợp lệ');
  return parseGoongDirections(await geoApi.directions(from, to, vehicle, signal));
};
