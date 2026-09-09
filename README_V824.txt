V824 - Chat tự nhiên hơn + ẩn thuật ngữ AI khỏi giao diện khách

File cần up đè:
- app.js
- styles.css
- lib/public-api/ai-chat.js

Thay đổi:
- AI/chat được phép thỉnh thoảng dùng 0-1 emoji phù hợp ngữ cảnh, không lạm dụng.
- Không dùng emoji ở giá, bảo hành, pháp lý hoặc thông tin cần chính xác.
- Bỏ chữ "AI hỗ trợ" và "Trợ lý AI" khỏi giao diện khách.
- Thay bằng "Hỗ trợ trực tuyến" và "Hỗ trợ tự động của Siêu Di Động" để giao diện tự nhiên nhưng vẫn minh bạch đây là hệ thống tự động.
- Loại bỏ câu trả lời kiểu "shop bổ sung cho AI".
- Nếu khách hỏi trực tiếp có phải người thật không, hệ thống vẫn trả lời trung thực.
