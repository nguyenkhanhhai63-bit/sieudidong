# Siêu Di Động V57 — Link thông số thủ công

## Mục tiêu
Thông số kỹ thuật không còn phụ thuộc vào việc đoán model. Mỗi model có thể được gắn thủ công với đúng URL nguồn.

## File cần sửa
`spec-links.js`

Ví dụ:

```js
window.SIEUDIDONG_SPEC_LINKS = {
  "Honor WIN RT": "https://mobilecity.vn/dien-thoai/link-dung-cua-may.html",
  "Honor WIN 5G": "https://mobilecity.vn/dien-thoai/link-dung-cua-may.html",
  "Redmi K90 Max": "https://mobilecity.vn/dien-thoai/link-dung-cua-may.html"
};
```

Không cần tạo link riêng cho từng màu hoặc dung lượng của cùng một model.

## Nguyên tắc
- Ưu tiên link được khai báo thủ công.
- Model chưa có link không nên tự lấy thông số của model gần giống.
- Hàm `resolveSpecSourceUrl(productName)` trả về URL nguồn chính xác đã khai báo.
- Parser thông số hiện tại vẫn được giữ nguyên để tương thích với backend/API đang dùng.
