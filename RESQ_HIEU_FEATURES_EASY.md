# Nhánh `hieu` có gì khác `main`? — Bản dễ hiểu

**Mục đích:** để bạn quyết định lấy gần hết giao diện của `hieu` mà vẫn giữ `main` làm nhánh chính.

---

## 0. Tóm tắt trong 1 phút

- **`main` giống như chiếc xe đang chạy thật:** đăng nhập, tạo đơn cứu hộ, điều gara, bản đồ, nhân viên nhận đơn, SOS, quản trị. Giao diện gọn, ít trang trí.
- **`hieu` giống như bộ áo đẹp:** nhiều màn hình, nhiều thẻ, nhiều màu, nhiều hiệu ứng. Nhưng phần lớn nút bên trong chỉ đang **trình diễn**, chưa nối vào hệ thống thật.
- `hieu` có khoảng **14 màn mới** và **2 tiện ích nổi** (mascot + bong bóng chat).
- Trong đó, **4 nhóm chức năng thật sự đáng lấy** là: hồ sơ cá nhân, quản lý nhiều xe, địa điểm đã lưu, danh bạ khẩn cấp.
- Phần còn lại đa số là **giao diện đẹp + dữ liệu mẫu**.

**Câu chốt:** Lấy gần hết **phần nhìn** thì được. Lấy gần hết **màn hình rồi thay luôn cách chạy** thì không.

---

## 1. Cách hiểu nhanh: xương sống và quần áo

| | `main` | `hieu` |
|---|---|---|
| Vai trò | Xương sống, bộ máy đang chạy | Bộ quần áo, giao diện trình diễn |
| Đơn cứu hộ | Có thật | Chỉ là đơn giả |
| Gara / bản đồ | Có thật | Dữ liệu mẫu |
| Nhân viên gara | Có | Không có |
| Quản trị | Có | Không có |
| Tài khoản cá nhân | Ít | Nhiều và đẹp |
| Số màn hình | Ít nhưng dùng được | Nhiều nhưng phần lớn là mẫu |

Nếu lấy `hieu` thay `main`, bạn được bộ áo đẹp nhưng mất bộ máy.  
Nếu lấy `hieu` **mặc lên** `main`, bạn được cả hai.

---

## 2. 14 màn mới của `hieu` (main chưa có)

| # | Màn hình | Người dùng thấy gì | Thật hay chỉ để trình diễn? | Có nên lấy? |
|---|---|---|---|---|
| 1 | Thông tin cá nhân | Sửa họ tên, email, ảnh đại diện; xem số điện thoại | **Thật một nửa**: tên/email lưu được; ảnh chỉ đổi trên màn hình, chưa lưu | **Nên lấy**, bỏ phần ảnh nếu chưa làm |
| 2 | Quản lý phương tiện | Thêm/sửa/xóa xe, biển số, VIN, màu, đặt xe mặc định | **Thật** (lưu trên máy chủ của hieu) | **Nên lấy** |
| 3 | Địa điểm đã lưu | Nhà riêng, cơ quan, địa điểm khác; thêm/sửa/xóa | **Thật** | **Nên lấy** |
| 4 | Chi tiết chính sách | Đọc nội dung từng điều khoản/chính sách | Nội dung tĩnh | **Lấy được** |
| 5 | Thanh toán | Danh sách thẻ, nút thêm thẻ/ví | **Mẫu** | Để sau hoặc ẩn |
| 6 | Kho voucher | Mã giảm giá, tab đã dùng | **Mẫu** | Để sau hoặc ẩn |
| 7 | Giới thiệu bạn bè | Mã `RESQ2026`, nút copy/chia sẻ | **Mẫu** | Để sau hoặc ẩn |
| 8 | Thông báo | Công tắc chế độ lái xe, SOS, khuyến mãi, cập nhật | **Mẫu**, không lưu | Để sau hoặc ẩn |
| 9 | Bảo mật | Đổi mật khẩu, 2 lớp, thiết bị đăng nhập | **Mẫu**, chưa nối | Để sau hoặc ẩn |
| 10 | Trung tâm trợ giúp | Câu hỏi thường gặp, nút chat nhân viên | Nội dung tĩnh, nút chat chưa nối | **Lấy được** |
| 11 | Điều khoản & chính sách | Danh sách chính sách, trang đọc chi tiết | Nội dung tĩnh | **Lấy được** |
| 12 | Về ResQ | Phiên bản, website, email, đánh giá | Nội dung tĩnh | **Lấy được** |
| 13 | Lịch sử hoạt động | 3 tab: cứu hộ, sửa chữa, gara | **Dữ liệu mẫu** | Lấy khung, thay bằng đơn thật |
| 14 | Đăng nhập OTP | Nhập số điện thoại, mã OTP, Google/Facebook | Có backend riêng của hieu | **Không nên lấy** |

Ngoài 14 màn trên, `hieu` còn **nâng cấp màn Danh bạ khẩn cấp** — màn này `main` đã có, nhưng chỉ lưu trên điện thoại; bản `hieu` lưu trên máy chủ. Đây là nâng cấp đáng lấy (xem mục 4.4).

Ngoài ra còn 2 thứ chỉ là hiệu ứng:

- **Màn hình chờ có linh vật Q-Bin**.
- **Bong bóng chat nổi** ở góc màn hình.

Hai thứ này đẹp, không ảnh hưởng chức năng, nhưng phải test kỹ vì dễ che nút SOS hoặc vướng cử chỉ vuốt.

---

## 3. Những màn `main` đã có, `hieu` làm lại đẹp hơn

| Màn | `main` hiện tại | `hieu` làm gì khác | Nên xử lý |
|---|---|---|---|
| Trang chủ | Một câu hỏi, một nút cứu hộ, đơn thật đang chạy | Nhiều khối: lời chào, 2 chế độ Hội viên/Khám phá, thẻ xe, tin tức, dịch vụ nhanh, bản đồ nhỏ, gói dịch vụ, đơn giả | **Lấy bố cục, giữ đơn thật** |
| Cài đặt | Tối giản: hồ sơ, chế độ tối, vài mục, đăng xuất | Ảnh đại diện, thống kê, thẻ xe, 3 nhóm menu, banner giới thiệu, ngôn ngữ | **Lấy giao diện, bỏ số liệu giả** |
| Danh bạ khẩn cấp | Lưu trên điện thoại | Lưu trên máy chủ, có trạng thái tải/lỗi | **Lấy bản hieu** |
| Phát hiện va chạm | Tạo đơn SOS thật | Giao diện mô phỏng | **Giữ cách chạy main, lấy cách trình bày** |
| Trợ lý Q-Bin | Chat mẫu | Chat mẫu + bong bóng nổi | Để sau |
| Đánh giá chuyến đi | Có | **Giống hệt main** | Không cần lấy |
| Gói ReSOS | Có | **Giống hệt main** | Không cần lấy |

---

## 4. Bốn chức năng đáng lấy nhất (3 mới + 1 nâng cấp)

### 4.1. Hồ sơ cá nhân

Người dùng có thể:

- Xem và sửa họ tên.
- Xem email.
- Xem số điện thoại.
- Nhìn ảnh đại diện.

**Lưu ý:** phần đổi ảnh trong `hieu` mới chỉ đổi trên màn hình, chưa lưu lại. Nếu lấy, nên làm tiếp phần lưu ảnh hoặc tạm ẩn nút camera.

### 4.2. Quản lý nhiều xe

Người dùng có thể:

- Thêm xe mới.
- Sửa tên xe, biển số, số VIN, màu xe.
- Xóa xe.
- Chọn một xe làm xe mặc định.

Đây là thứ `main` đang thiếu: hiện mỗi tài khoản chỉ có một biển số. Lấy phần này sẽ giúp ích thật cho luồng cứu hộ về sau.

### 4.3. Địa điểm đã lưu

Người dùng có thể lưu:

- Nhà riêng.
- Cơ quan.
- Địa điểm khác.

Mỗi địa điểm có tên, địa chỉ, và có thể có vị trí trên bản đồ. Hiện `main` chưa có màn này.

### 4.4. Danh bạ khẩn cấp (nâng cấp)

Người dùng có thể:

- Thêm người thân.
- Sửa tên, số điện thoại, mối quan hệ.
- Xóa.
- Bật/tắt chia sẻ vị trí khi gặp sự cố.

`main` đã có màn này nhưng chỉ lưu trên điện thoại. `hieu` lưu trên máy chủ, nên đổi máy vẫn còn. Đây là nâng cấp đáng làm, không phải màn mới.

---

## 5. Những thứ `hieu` có nhưng chỉ là "vỏ"

Phần này rất quan trọng: **đẹp không có nghĩa là chạy thật**.

| Thứ trông như thật | Thực tế |
|---|---|
| Đơn đang xử lý trên Trang chủ | Đơn giả, bấm nút là bật/tắt |
| Đếm ngược thời gian cứu hộ | Đếm cho vui, không nối đơn thật |
| "6 gara gần bạn", "AutoPro 0.8 km" | Số viết tay |
| Danh sách gara | Dữ liệu mẫu |
| Bản đồ và chỉ đường | Dữ liệu mẫu |
| Tài xế, ETA, giá tiền | Dữ liệu mẫu |
| Tin tức trên Trang chủ | Ảnh và tiêu đề mẫu |
| Thống kê lượt cứu hộ | Tất cả bằng 0 |
| Nhắc bảo dưỡng 40.000 km | Nội dung mẫu |
| Thẻ thanh toán | Thẻ mẫu |
| Voucher | Mã mẫu |
| Mã giới thiệu | Mã cố định |
| Lịch sử hoạt động | Dữ liệu mẫu |
| Công tắc thông báo | Chỉ đổi màu, không lưu |
| Công tắc bảo mật | Chỉ đổi màu, không lưu |
| Ảnh đại diện | Chỉ đổi trên màn hình |
| Nút "Chat với nhân viên" | Chưa nối |
| Nút "Đổi mật khẩu" / "2 lớp" | Chưa nối |

Nếu đưa nguyên những thứ này lên bản chính, người dùng sẽ bấm và thấy **không có gì xảy ra**. Như vậy tệ hơn là không có màn.

---

## 6. Những thứ `main` có mà `hieu` không có — đừng làm mất

Đây là lý do phải giữ `main` làm gốc:

1. **Tạo đơn cứu hộ thật**, chọn sự cố, vị trí, mức ưu tiên.
2. **Điều phối gara thật**, gara nhận đơn, báo đã đến, bắt đầu sửa, hoàn thành.
3. **Theo dõi đơn theo thời gian thực**, có tuyến đường và vị trí xe cứu hộ.
4. **Bản đồ thật**, tìm gara/trạm xăng/trạm sạc, xem trước tuyến đường.
5. **SOS thật**, gửi vị trí và thông tin người bị nạn.
6. **Tài khoản nhân viên gara**, nhận việc, hồ sơ gara.
7. **Đăng ký gara đối tác**.
8. **Trang quản trị** cho tổng đài.
9. **Đăng nhập email/mật khẩu**, phân quyền khách/nhân viên/quản trị.
10. **Đổi máy chủ**, tự tìm máy chủ khi mở app.

`hieu` không có cái nào trong danh sách trên. Nếu thay `main` bằng `hieu`, gần như toàn bộ phần vận hành sẽ biến mất.

---

## 7. "Lấy gần hết giao diện" nên hiểu theo 3 mức

### Mức 1 — Lấy nguyên bản (an toàn nhất)

Chỉ copy cách trình bày, không đổi cách chạy:

- Các màn tĩnh: Giới thiệu, Trợ giúp, Điều khoản, Chính sách.
- Bố cục Cài đặt.
- Các form hồ sơ, xe, địa điểm, liên hệ.
- Màn hình chờ, bong bóng chat.
- Màu sắc, khoảng cách, bo góc, kiểu chữ.

**Ước tính: khoảng 40% giao diện của `hieu`.**

### Mức 2 — Lấy khung, giữ ruột `main` (nên làm)

Lấy bố cục đẹp nhưng dữ liệu và xử lý vẫn là của `main`:

- Trang chủ: giữ đơn thật, bỏ đơn giả và tin tức mẫu.
- ReFix: giữ gara thật, bỏ danh sách mẫu.
- Bản đồ: giữ bản đồ thật, bỏ bản đồ mẫu.
- Theo dõi đơn: giữ vị trí thật, bỏ tài xế mẫu.
- Phát hiện va chạm: giữ SOS thật, lấy cách trình bày.
- Cài đặt: lấy bố cục, thay số liệu thật.

**Ước tính: khoảng 40%.**

### Mức 3 — Không nên lấy

- Đăng nhập OTP/Google/Facebook.
- Đơn giả, đếm ngược giả.
- Tin tức mẫu.
- Thanh toán/voucher/giới thiệu khi chưa có hệ thống thật.
- Công tắc thông báo/bảo mật giả.
- Toàn bộ phần máy chủ của `hieu`.
- Thư mục cài đặt riêng cho Android của `hieu`.

**Ước tính: khoảng 20%.**

---

## 8. Nếu lấy gần hết, thứ tự nên làm

### Bước 1 — Lấy phần ít rủi ro nhất

- Cài đặt mới.
- Thông tin cá nhân.
- Quản lý xe.
- Địa điểm đã lưu.
- Danh bạ khẩn cấp.

Lý do: đẹp, tách biệt, ít ảnh hưởng luồng cứu hộ.

### Bước 2 — Lấy các màn tĩnh

- Giới thiệu.
- Trợ giúp.
- Điều khoản.
- Chính sách.

Lý do: gần như không có rủi ro.

### Bước 3 — Làm lại Trang chủ

- Giữ đơn thật đang chạy.
- Giữ nút cứu hộ.
- Lấy bố cục thẻ, màu, khoảng cách.
- Bỏ 2 chế độ Hội viên/Khám phá nếu không có dữ liệu thật.
- Bỏ tin tức mẫu hoặc thay bằng tin thật.

### Bước 4 — Làm lại ReFix và Bản đồ

- Chỉ đổi "áo": màu, thẻ, nút, bố cục.
- Giữ nguyên cách tìm gara, tạo đơn, chỉ đường, theo dõi.

Đây là bước rủi ro nhất, vì đây là lõi vận hành. Làm sau cùng và test kỹ.

### Bước 5 — Các tính năng demo

- Thanh toán.
- Voucher.
- Giới thiệu bạn bè.
- Thông báo.
- Bảo mật.

Chỉ làm khi có hệ thống thật. Nếu chưa, ẩn hoặc ghi "Sắp ra mắt".

---

## 9. Năm thứ phải kiểm tra sau mỗi lần lấy giao diện

1. **Đăng nhập** vẫn vào đúng tài khoản, đúng vai.
2. **Tạo đơn cứu hộ** vẫn gửi được và gara nhận được.
3. **Nhân viên gara** vẫn nhận đơn, báo đến, hoàn thành.
4. **Bản đồ và vị trí** vẫn chạy thật.
5. **SOS** vẫn gửi được, kể cả khi mạng yếu.

Nếu một trong năm thứ trên hỏng, phải quay lại ngay — đừng tiếp tục lấy thêm màn.

---

## 10. Trả lời câu hỏi "lấy gần hết có được không?"

**Được**, nếu "gần hết" là:

- Gần hết **cách trình bày**.
- Gần hết **màn hình phụ**.
- Gần hết **cảm giác cao cấp**: màu, thẻ, khoảng cách, hiệu ứng.

**Không được**, nếu "gần hết" là:

- Thay toàn bộ ứng dụng `main` bằng ứng dụng `hieu`.
- Copy nguyên dữ liệu mẫu.
- Copy nguyên cách đăng nhập.
- Copy nguyên máy chủ.
- Bỏ qua kiểm tra luồng cứu hộ.

**Công thức an toàn:**

> `main` là bộ máy. `hieu` là bộ áo.  
> Mặc áo mới từng phần, vẫn chạy thử máy sau mỗi lần mặc.

---

## 11. Kết luận ngắn

- `hieu` đẹp hơn ở: Cài đặt, Tài khoản, Trang chủ, các màn phụ, hiệu ứng.
- `hieu` thua `main` hoàn toàn ở: cứu hộ thật, gara, bản đồ, nhân viên, quản trị.
- 4 thứ đáng lấy nhất: **hồ sơ, nhiều xe, địa điểm đã lưu, danh bạ khẩn cấp**.
- 3 thứ không nên lấy: **đăng nhập OTP, dữ liệu mẫu, máy chủ của hieu**.
- Cách đúng: **giữ `main`, thay giao diện từng màn, ẩn những gì chưa thật.**
