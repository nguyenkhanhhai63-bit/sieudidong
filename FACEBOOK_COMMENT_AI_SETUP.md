# Facebook Comment AI - Siêu Di Động

## Đã tích hợp
- Webhook: `https://sieudidong.vn/api/facebook-webhook`
- Nhận comment mới từ webhook Page `feed`.
- Chống xử lý trùng comment bằng Redis.
- Dùng `/api/products` + `/api/ai-chat` hiện tại để lấy câu trả lời đúng dữ liệu website.
- Viết lại câu trả lời theo Prompt Facebook trong Admin.
- Có độ trễ ngẫu nhiên trước khi reply.
- Comment chốt/đặt/giữ máy được hướng vào inbox để nhân viên xử lý.
- Có bộ lọc comment bỏ qua.

## Biến môi trường Vercel
- `FACEBOOK_PAGE_ID`
- `FACEBOOK_PAGE_ACCESS_TOKEN`
- `FACEBOOK_WEBHOOK_VERIFY_TOKEN`
- `FACEBOOK_APP_SECRET` (khuyến nghị để xác thực chữ ký webhook)
- `FACEBOOK_GRAPH_VERSION` (tùy chọn; mặc định trong code là `v25.0`)
- Giữ nguyên các biến đã có: `GEMINI_API_KEY`, `REDIS_URL`, `SITE_URL` và biến dữ liệu sản phẩm hiện tại.

## Meta App / Webhook
1. Tạo hoặc dùng Meta App có quyền quản lý Page của Siêu Di Động.
2. Cấu hình Webhooks cho Page với callback URL ở trên.
3. Verify token phải giống `FACEBOOK_WEBHOOK_VERIFY_TOKEN` trên Vercel.
4. Subscribe trường `feed` để nhận comment bài viết.
5. Page Access Token cần đủ quyền đọc tương tác Page và quản lý/trả lời comment theo cấu hình app của Meta.
6. Sau khi Meta gửi webhook thành công, vào Admin > Đào tạo AI > Facebook Comment AI và bật tự động trả lời.

## Lưu ý
- Không lưu Page Access Token trực tiếp trong giao diện Admin; token chỉ nằm trong Environment Variables trên Vercel.
- Nếu Meta thay đổi phiên bản Graph API, đặt `FACEBOOK_GRAPH_VERSION` theo phiên bản app đang dùng.
