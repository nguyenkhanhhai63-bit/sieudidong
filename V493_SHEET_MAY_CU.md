# V493 - Đồng bộ Google Sheet máy cũ mới

Hỗ trợ cấu trúc cột:

STT | TÊN MÁY | HÃNG | MÀU | ROM | PHỤ KIỆN | TÌNH TRẠNG | DUNG LƯỢNG | IMEI | GIÁ NHẬP | GIÁ BÁN | LỢI NHUẬN | NGÀY NHẬP | NGÀY BÁN | BẢO HÀNH | TRẠNG THÁI

Thay đổi chính:
- Đọc cột theo tên tiêu đề thay vì vị trí cố định, nên kéo đổi vị trí cột vẫn đồng bộ được.
- Đồng bộ MÀU, ROM, PHỤ KIỆN, TÌNH TRẠNG, DUNG LƯỢNG, BẢO HÀNH, TRẠNG THÁI từ Sheet.
- GIÁ NHẬP, LỢI NHUẬN và IMEI vẫn là dữ liệu nội bộ; API công khai không trả các trường này.
- Ảnh thực tế tiếp tục upload trực tiếp trên web/Cloudinary và gắn với máy từ Sheet.
- GHI CHÚ là tùy chọn: nếu Sheet có cột GHI CHÚ thì đọc được; nếu không có vẫn có thể ghi chú trong quản trị web.
- ROM đã được bổ sung vào chi tiết máy cũ ngoài website.
- Đổi cache Sheet sang v4 để không giữ dữ liệu parse theo cấu trúc cũ.
