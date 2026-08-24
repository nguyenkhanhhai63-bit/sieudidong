# V114 - Fix Gemini compare

- Fix lỗi Gemini 2.5: không còn gửi `thinkingLevel` cho model 2.5; dùng `thinkingBudget: 0`.
- Bỏ `gemini-2.0-flash` khỏi fallback vì model 2.0 đã ngừng hoạt động.
- Mặc định ưu tiên `gemini-2.5-flash-lite` để phản hồi nhanh và ổn định hơn.
- Fallback: `gemini-2.5-flash-lite` -> `gemini-2.5-flash` -> `gemini-3.1-flash-lite`.
- Lỗi 400/404 do model/config cũng tự chuyển sang model dự phòng.

Vercel: chỉ cần giữ `GEMINI_API_KEY`. Nếu đã đặt `GEMINI_COMPARE_MODEL` hoặc `GEMINI_FALLBACK_MODELS` cũ thì nên xóa 2 biến đó để dùng cấu hình mặc định V114, sau đó Redeploy.
