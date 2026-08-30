# TikTok AI Chat – Siêu Di Động

Bản này thêm endpoint webhook:

`https://sieudidong.vn/api/tiktok-webhook`

## Biến môi trường trên Vercel

Bắt buộc:

- `TIKTOK_BUSINESS_ACCESS_TOKEN` – access token của TikTok Business Messaging API.
- `TIKTOK_BUSINESS_ID` – `open_id`/Business Account ID trả về sau khi authorize TikTok Business Account.
- `GEMINI_API_KEY` – đang dùng cho AI chat web.
- `REDIS_URL` – đang dùng cho lịch sử/đào tạo AI.
- `SITE_URL=https://sieudidong.vn`

Tùy chọn:

- `TIKTOK_AI_ENABLED=1` – đặt `0` để tắt AI TikTok nhưng vẫn giữ webhook online.
- `TIKTOK_WEBHOOK_SECRET` – chỉ bật khi cấu hình TikTok của bạn cung cấp signing secret tương ứng.

## TikTok Developer / API for Business

1. Xin quyền Business Messaging API cho app TikTok Business.
2. Authorize đúng Business Account và lấy access token + business/open ID.
3. Tạo Business Messaging webhook loại Direct Message trỏ về:
   `https://sieudidong.vn/api/tiktok-webhook`
4. Bật quyền Business Messaging Read + Send theo yêu cầu của TikTok.
5. Nhắn thử từ một tài khoản TikTok khác vào Business Account.

## Cách hoạt động

TikTok DM -> webhook -> lấy sản phẩm hiện tại từ `/api/products` -> gửi câu hỏi vào `/api/ai-chat` -> AI dùng chung prompt/đào tạo web -> trả lời lại TikTok.

Có sẵn:

- Chống webhook gửi trùng bằng Redis.
- Lưu 10 tin nhắn gần nhất theo từng conversation.
- Hiển thị trạng thái `Typing` trước khi AI trả lời.
- Chia câu trả lời nhiều dòng thành nhiều tin TikTok ngắn.
- Khi khách nói “gặp nhân viên”, “người thật”, “chốt máy”, “giữ máy” thì AI dừng 30 phút để nhân viên tiếp quản.
- Khách có thể nhắn “AI trả lời” để bật AI lại ngay.

## Kiểm tra nhanh sau deploy

Mở:

`https://sieudidong.vn/api/tiktok-webhook`

Nếu cấu hình đúng sẽ thấy JSON với `ok: true`, `enabled: true`, `businessConfigured: true`, `tokenConfigured: true`.

## Lưu ý

TikTok chỉ cho gửi DM theo các cửa sổ/quy tắc nhắn tin của Business Messaging API. API không cho bot tự ý nhắn người chưa mở hội thoại trước, trừ các trường hợp/direct-reply được TikTok cho phép.
