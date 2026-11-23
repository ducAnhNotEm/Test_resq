// qbinReplies.ts: câu trả lời của trợ lý Q-Bin — theo TỪ KHÓA, kiến thức xử lý sự cố chung (không phải AI).
// Không bịa dữ liệu: không nêu tên gara / khoảng cách / số km bảo dưỡng không có thật — chỉ hướng dẫn an toàn
// và chỉ tới chức năng thật (ReFix tìm gara thật, ReMaps, SOS, tổng đài). Thuần TS → test bằng Node.

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export function qbinGreeting(name: string | null | undefined, vehicle: { name: string; plate: string } | null): string {
  const first = (name ?? '').trim().split(/\s+/).pop();
  const hi = first ? `Xin chào ${first}!` : 'Xin chào!';
  const car = vehicle ? ` Xe ${vehicle.name} (${vehicle.plate}) đang gặp vấn đề gì?` : ' Xe của bạn đang gặp vấn đề gì?';
  return `${hi} Mình là Q-Bin — trợ lý hướng dẫn xử lý sự cố xe của ResQ.${car} Bạn có thể hỏi về lốp, ắc quy, tiếng kêu lạ, đèn báo, bảo dưỡng…`;
}

const RULES: Array<{ keys: string[]; reply: string }> = [
  {
    keys: ['tai nan', 'va cham', 'dam xe', 'bi thuong', 'chay xe', 'boc chay'],
    reply: 'Ưu tiên an toàn: bật đèn khẩn cấp, ra khỏi xe đứng sau lan can / lề đường. Có người bị thương → gọi 115 ngay, không di chuyển nạn nhân. Sau đó bấm nút SOS (giữ 3 giây): tín hiệu kèm vị trí tới thẳng tổng đài ResQ — tổng đài gọi lại, báo 115 và người thân của bạn.',
  },
  {
    keys: ['lop', 'thung', 'xit', 'no lop', 'banh xe', 'non hoi'],
    reply: 'Lốp thủng / xịt: giảm tốc từ từ, giữ chặt vô-lăng, tấp vào lề an toàn rồi bật đèn khẩn cấp. Không chạy tiếp khi lốp xẹp hẳn (hỏng la-zăng). Có lốp dự phòng thì thay; không thì vào ReFix → "Thủng / nổ lốp" để tìm nơi vá lốp gần nhất.',
  },
  {
    keys: ['ac quy', 'binh dien', 'de khong no', 'khong no may', 'khong de duoc', 'het dien', 'khong khoi dong', 'khong len may'],
    reply: 'Đề không nổ, đèn táp-lô yếu: thường do ắc quy yếu. Tắt hết đèn / điều hòa rồi thử lại; có dây câu bình thì câu từ xe khác (cực dương trước, cực âm sau). Không được → ReFix → "Hết ắc quy" để gọi người tới kích bình hoặc thay ắc quy.',
  },
  {
    keys: ['het xang', 'het dau', 'xang', 'nhien lieu', 'tram sac', 'het pin'],
    reply: 'Hết nhiên liệu: tấp vào lề, bật đèn khẩn cấp. Mở ReMaps → "Cây xăng" (hoặc "Trạm sạc" với xe điện) để xem nơi gần nhất; nếu không tự đi được, gửi yêu cầu cứu hộ qua ReFix.',
  },
  {
    keys: ['nong may', 'qua nhiet', 'boc khoi', 'khoi', 'nuoc lam mat', 'kim nhiet'],
    reply: 'Kim nhiệt cao / bốc khói: dừng xe ở nơi an toàn, tắt máy. KHÔNG mở nắp két nước khi máy còn nóng (dễ bỏng). Chờ ít nhất 30 phút rồi kiểm tra nước làm mát. Còn bốc khói hoặc rò rỉ → gọi cứu hộ kéo xe qua ReFix.',
  },
  {
    keys: ['den bao', 'check engine', 'den vang', 'den do', 'canh bao'],
    reply: 'Đèn báo ĐỎ (dầu máy, nhiệt độ, phanh, ắc quy): dừng xe an toàn càng sớm càng tốt. Đèn VÀNG (check engine…): vẫn đi được nhưng nên kiểm tra sớm. Chụp lại đèn báo và vào ReFix → "Chưa rõ nguyên nhân" để gara kiểm tra.',
  },
  {
    keys: ['keu', 'tieng la', 'rung', 'lac', 'phanh'],
    reply: 'Tiếng kêu lạ: kêu rít khi phanh thường do má phanh mòn; kêu lạch cạch khi đánh lái có thể do rô-tuyn / thước lái; rung mạnh có thể do lốp hoặc mâm. Liên quan tới PHANH hoặc LÁI thì không nên đi tiếp — tìm gara qua ReFix để kiểm tra.',
  },
  {
    keys: ['bao duong', 'thay dau', 'dinh ky', 'lich bao duong'],
    reply: 'Mốc bảo dưỡng phụ thuộc hãng xe — xem sổ bảo hành của xe. Thông thường: thay dầu máy mỗi 5.000–10.000 km, kiểm tra lốp / phanh / ắc quy mỗi lần thay dầu. Cần chỗ bảo dưỡng: ReFix hoặc ReMaps → "Gara" hiện các gara thật quanh bạn.',
  },
  {
    keys: ['gara', 'sua xe', 'tiem', 'cuu ho', 'keo xe'],
    reply: 'Để tìm gara / cứu hộ gần bạn: vào tab ReFix → chọn sự cố. ResQ xếp hạng các gara thật theo khoảng cách, đúng dịch vụ và giờ mở cửa; gara đối tác nhận đơn và bạn theo dõi xe tới trên bản đồ.',
  },
  {
    keys: ['khoa', 'chia khoa', 'ket chia'],
    reply: 'Kẹt / quên chìa khóa trong xe: đừng đập kính. Kiểm tra chìa dự phòng; nếu không có, vào ReFix → "Chưa rõ nguyên nhân" và ghi chú "kẹt chìa khóa" để gara mở khóa hỗ trợ.',
  },
];

const FALLBACK = 'Mình chưa hiểu rõ vấn đề. Bạn mô tả thêm (vd. "đề không nổ", "lốp xịt", "đèn báo đỏ"), hoặc vào ReFix để gửi yêu cầu cứu hộ — cần người hỗ trợ ngay thì gọi tổng đài 1900 6868.';

export function qbinReply(text: string): string {
  const t = norm(text);
  for (const r of RULES) if (r.keys.some(k => t.includes(k))) return r.reply;
  return FALLBACK;
}
