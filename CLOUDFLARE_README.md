# Siêu Di Động — bản chuyển thử nghiệm Cloudflare Workers

**Trạng thái: bản chuyển đổi kỹ thuật để kiểm thử, chưa xác nhận sẵn sàng chạy production.**

## Triển khai thử

1. Cài Node.js 20+; trong thư mục này chạy `npm install`.
2. Chạy `npx wrangler login`, rồi `npm run dev` để kiểm tra cục bộ.
3. Đưa secrets bằng `npx wrangler secret put TEN_BIEN` (không ghi API key vào file).
4. Chạy `npm run deploy` để nhận tên miền thử nghiệm workers.dev.
5. Chỉ chuyển DNS sieudidong.vn sau khi kiểm thử toàn bộ chức năng và xác nhận phương án Redis.

## Cảnh báo cần xử lý trước khi dùng chính thức

- Source gốc dùng thư viện `redis` kết nối TCP (`REDIS_URL`). Khả năng tương thích TCP/TLS, kết nối Redis, giới hạn kết nối và thời gian chạy trên Workers **chưa được xác minh**. Nên chuyển sang Redis HTTP (ví dụ Upstash REST) hoặc dịch vụ phù hợp, rồi kiểm thử từng lệnh Redis đang dùng. Không chuyển dữ liệu sang KV một cách máy móc vì lệnh Redis có ngữ nghĩa khác.
- Các handler Vercel sử dụng req/res Node. Adapter trong `src/worker.js` mới hỗ trợ những phương thức phổ biến (`status`, `json`, `send`, `end`, `redirect`, `setHeader`), chưa bảo đảm hỗ trợ streaming, cookies nhiều header, multipart, và các trường hợp webhook đặc biệt.
- Các imports `@vercel/functions` trong `lib/public-api/products.js`, `lib/public-api/facebook-webhook.js`, `api/tiktok-webhook.js` cần thay bằng cơ chế Cloudflare thích hợp trước khi build/deploy hoàn chỉnh. Chưa được thay ở bản này.
- Xác minh webhook TikTok/Facebook, đồng bộ KiotViet, AI Gemini/OpenAI, lịch sử Redis, phiên đăng nhập quản trị, in tem, tra cứu bảo hành, Cloudinary.
- Giữ nguyên Vercel và DNS hiện tại trong giai đoạn thử nghiệm.
- File ZIP người dùng cung cấp có thể chưa bao gồm bản cập nhật V11/V12; kiểm tra phiên bản trước khi dùng.

## Biến môi trường

Sao chép tên biến từ Vercel sang Cloudflare Workers Secrets, không sao chép giá trị ra chat. Có thể cần `REDIS_URL`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` và các khóa KiotViet, Cloudinary, Google Sheet tùy tính năng đang sử dụng.

## Kiểm thử tối thiểu

- Trang chủ và các trang tĩnh; URL rewrite cũ.
- `/api/products`, `/api/ai-chat`, `/api/warranty-lookup`.
- `/api/admin/login`, `/api/admin/session`, cập nhật dữ liệu quản trị.
- Đồng bộ KiotViet và đọc/ghi Redis.
- Facebook/TikTok webhook và chữ ký xác thực.
- Mọi response/cookie/header, CORS, cache, và bảo vệ API admin.

**Không đổi DNS khi bất kỳ bước quan trọng nào chưa đạt.**
