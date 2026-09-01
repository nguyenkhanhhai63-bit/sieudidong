# TikTok Shop AI – Siêu Di Động (bản đúng cho Partner Center)

App trong TikTok Shop Partner Center đã được duyệt thì dùng **TikTok Shop Open API**, không dùng endpoint Business Messaging cũ.

## 1. Environment Variables trên Vercel

Bắt buộc:

- `TIKTOK_SHOP_APP_KEY` – App Key trong App & Service của TikTok Shop Partner Center.
- `TIKTOK_SHOP_APP_SECRET` – Secret của app. Không đưa secret vào code/frontend.
- `TIKTOK_SHOP_SERVICE_ID` – Service ID của app dùng cho seller authorization.
- `TIKTOK_SHOP_AUTH_REGION=ROW` – Việt Nam dùng ROW.
- `TIKTOK_AI_ENABLED=1`
- `SITE_URL=https://sieudidong.vn`
- `GEMINI_API_KEY` – AI chat web đang dùng.
- `REDIS_URL` – lưu token, lịch sử chat và chống webhook trùng.

## 2. Scope cần bật/được duyệt

Tối thiểu:

- `seller.customer_service` – nhận/đọc/gửi chat TikTok Shop.
- `seller.authorization.info` – lấy shop và cấu hình webhook.

Nếu app chỉ được “Approved” nhưng chưa được cấp `seller.customer_service`, phần AI chat vẫn chưa hoạt động cho tới khi scope này được TikTok cấp.

## 3. Redirect URL

Trong Partner Center đặt Redirect URL:

`https://sieudidong.vn/api/tiktok-connect`

Sau khi deploy, mở URL này trên trình duyệt và đăng nhập đúng TikTok Shop của Siêu Di Động. Web sẽ tự đổi `auth_code` lấy access token, lấy `shop_cipher`, lưu token vào Redis và tự đăng ký webhook `NEW_MESSAGE`.

## 4. Webhook

Callback đã có sẵn:

`https://sieudidong.vn/api/tiktok-webhook`

Webhook xác thực đúng chuẩn TikTok Shop bằng header `Authorization = HMAC-SHA256(app_key + raw_body, app_secret)`.

## 5. Cách hoạt động

Khách nhắn TikTok Shop → `NEW_MESSAGE` webhook → chỉ nhận tin `TEXT` từ role `BUYER` → lấy sản phẩm hiện tại từ `/api/products` → gọi chung `/api/ai-chat` → gửi câu trả lời qua Customer Service API.

Có sẵn:

- Ký API HMAC-SHA256 đúng chuẩn TikTok Shop.
- Gửi message qua `/customer_service/202309/conversations/{conversation_id}/messages`.
- Chống webhook trùng bằng `tts_notification_id`.
- Lưu 10 tin gần nhất theo từng conversation.
- Khi khách yêu cầu “nhân viên/người thật/chốt máy/giữ máy”, AI dừng 30 phút.
- Khách nhắn “AI trả lời” để bật AI lại.
- Tự refresh access token khi token gần hết hạn (nếu TikTok trả expiry).

## 6. Kiểm tra sau deploy

Mở:

`https://sieudidong.vn/api/tiktok-connect?status=1`

Khi thành công sẽ có:

- `configured: true`
- `connected: true`

Mở tiếp:

`https://sieudidong.vn/api/tiktok-webhook`

Sẽ thấy:

- `ok: true`
- `appConfigured: true`
- `connected: true`

Sau đó dùng một tài khoản khách nhắn vào TikTok Shop để thử AI trả lời.
