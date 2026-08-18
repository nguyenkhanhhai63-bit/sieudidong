# Siêu Di Động V58 — Trang quản trị link thông số riêng

## Người dùng công khai
Khách chỉ truy cập:
- `/`
- `/san-pham/...`

Không có nút thêm/sửa link thông số trên giao diện khách.

## Quản trị
Truy cập trực tiếp:
- `/admin-specs`

Trang này yêu cầu mật khẩu. Sau khi đăng nhập mới xem được danh sách model và:
- Dán link nguồn.
- Lưu link.
- Kiểm tra xem link có đọc được thông số không.
- Xóa link.

## Bảo mật
- Mật khẩu nằm trong Vercel Environment Variables, không nằm trong frontend.
- Session dùng cookie `HttpOnly + SameSite=Strict`.
- API `/api/admin/spec-links` từ chối người chưa đăng nhập.
- Link nguồn được lưu server-side trong Redis, không nằm trong file JS công khai.
- `/api/specs` chỉ trả thông số cho khách, không trả `sourceUrl`.

## Cần cấu hình trên Vercel

### 1. Mật khẩu admin
Project → Settings → Environment Variables:

```text
ADMIN_PASSWORD=<mật khẩu của bạn>
ADMIN_SESSION_SECRET=<một chuỗi ngẫu nhiên thật dài>
```

### 2. Redis để lưu link
Kết nối Upstash Redis/Vercel Marketplace Redis rồi thêm:

```text
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Code cũng hỗ trợ biến cũ:

```text
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

## Luồng hoạt động
1. Admin vào `/admin-specs`.
2. Đăng nhập.
3. Danh sách model được lấy từ `/api/products`.
4. Admin dán đúng link nguồn từng model.
5. Link được lưu server-side.
6. Khách mở sản phẩm → `/api/specs` tìm link model đã lưu → lấy 10 thông số chính → cache.
7. Nếu model chưa có link, trang khách chỉ hiện trạng thái đang cập nhật, không tự đoán model khác.


## V60 - Gộp biến thể thành model gốc
- Trang admin không còn liệt kê riêng từng màu/RAM/dung lượng.
- Ví dụ Honor WIN 5G Đen và Trắng chỉ còn 1 dòng `Honor WIN 5G`.
- Một link nguồn dùng chung cho mọi biến thể của cùng model.
- Mỗi dòng hiển thị số phiên bản đã được gộp.
