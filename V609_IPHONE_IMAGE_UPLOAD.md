# V609 - Upload ảnh máy cũ iPhone

- iPhone đồng bộ từ Google Sheet có nút Thêm ảnh / Cập nhật ảnh ngay trong Danh sách máy cũ.
- Ảnh upload lên Cloudinary bằng luồng ảnh máy cũ hiện tại.
- Ảnh được gắn theo IMEI / id `iphone-sheet-<IMEI>` để không nhầm giữa các máy cùng model.
- Khi tải lại admin, dữ liệu iPhone từ Sheet được ghép với overlay ảnh đã lưu.
- Trang Máy cũ công khai thử tải overlay ảnh từ API public và hiển thị ảnh thật thay placeholder khi có.
