# Bảng giá khách hàng lấy dữ liệu từ KiotViet

## Mục tiêu

Trang web này:
- đọc sản phẩm / giá / tồn kho từ KiotViet Public API
- không lộ Client Secret ra trình duyệt
- có ô tìm kiếm
- có chế độ chỉ hiện hàng còn tồn
- tự cập nhật mỗi 60 giây
- phù hợp deploy lên Vercel

KiotViet Public API dùng OAuth 2.0 với ClientId + Mã bảo mật; tài liệu chính thức cũng mô tả việc kết nối API từ gian hàng. 

## 1. Chuẩn bị bên KiotViet

Trong KiotViet, đăng nhập tài khoản admin và vào phần Thiết lập kết nối API.

Bạn cần 3 giá trị:

- Tên gian hàng / Retailer: `sieudidong`
- Client ID
- Mã bảo mật / Client Secret

KHÔNG đưa Client Secret vào app.js hoặc GitHub code công khai.

## 2. Deploy Vercel

Tạo một GitHub repository mới, ví dụ:

kiotviet-bao-gia

Upload toàn bộ:
- index.html
- styles.css
- app.js
- api/products.js
- vercel.json

Sau đó import repository đó vào Vercel.

## 3. Environment Variables trên Vercel

Project Settings -> Environment Variables

Thêm:

KIOTVIET_RETAILER
KIOTVIET_CLIENT_ID
KIOTVIET_CLIENT_SECRET

Sau đó Redeploy.

## 4. Domain

Có thể gắn:

banggia.sieudidong.vn

hoặc:

gia.sieudidong.vn

Vercel sẽ hướng dẫn CNAME cần tạo.

## 5. Lưu ý cấu trúc API

KiotViet có Public API phục vụ tích hợp website/CRM và hỗ trợ đối tượng Hàng hóa. Bộ code này đã tách phần bí mật sang API serverless, đúng hướng an toàn hơn so với gọi KiotViet trực tiếp từ trình duyệt.

Nếu API thực tế của gian hàng trả field khác một chút (ví dụ child products / inventories khác cấu trúc), chỉ cần chỉnh normalizeProduct() trong api/products.js.


## Cấu hình riêng cho gian hàng này

Retailer đã xác định là:

```text
sieudidong
```

Trên Vercel, tạo 3 Environment Variables:

```text
KIOTVIET_RETAILER=sieudidong
KIOTVIET_CLIENT_ID=<Client ID của bạn>
KIOTVIET_CLIENT_SECRET=<Mã bảo mật mới của bạn>
```

Không ghi Client Secret trực tiếp vào source code hoặc commit lên GitHub.


## Giao diện V2

Bản V2 nhóm các màu/dung lượng của cùng một model vào chung một khối để dễ xem hơn:
- 1 model = 1 card
- phiên bản màu/dung lượng nằm bên trong
- ô tìm kiếm sticky
- hiển thị số mẫu và số phiên bản
- mobile tối ưu 1 cột
- có thể thu gọn từng model


## Giao diện V3 - Có ảnh sản phẩm

KiotViet Public API có trường `images` là danh sách link hình ảnh sản phẩm.

Bản V3:
- lấy ảnh trực tiếp từ KiotViet API
- ưu tiên ảnh của phiên bản; nếu không có thì dùng ảnh sản phẩm cha
- ảnh lazy-load để giảm tải
- nếu sản phẩm không có ảnh thì hiện placeholder
- desktop ảnh 76x76, mobile 64x64
- vẫn giữ nhóm model, tìm kiếm, tồn kho và giá


## Giao diện V4 - Kiểu website

Thay đổi:
- giao diện dạng website/catalog sản phẩm
- card sản phẩm có ảnh lớn
- bỏ hoàn toàn mã sản phẩm khỏi giao diện
- tìm kiếm chỉ theo tên sản phẩm
- mỗi model là một card riêng
- các màu/dung lượng nằm gọn bên trong card
- mobile hiển thị dạng ảnh trái + thông tin phải


## Giao diện V5 - Thêm logo Siêu Di Động

Đã thêm 2 logo:
- `assets/logo-wide.jpg`: logo ngang dùng trên desktop.
- `assets/logo-square.jpg`: logo vuông dùng trên mobile, favicon và footer.

Upload toàn bộ thư mục `assets` cùng các file frontend.


## V6 - Ẩn sản phẩm ngừng kinh doanh

API KiotViet được gọi với:

`isActive=true`

Ngoài ra backend còn lọc thêm:

`p.isActive !== false`

Vì vậy các sản phẩm đã chuyển sang trạng thái ngừng kinh doanh trong KiotViet sẽ không xuất hiện trên website.


## V7 - Font cơ bản + phân loại sản phẩm

- Font toàn website chuyển về Arial / Helvetica / sans-serif để dễ đọc.
- Lấy danh sách Nhóm hàng trực tiếp từ KiotViet API `/categories`.
- Mỗi sản phẩm được gắn `categoryName` và nhóm cha `rootCategoryName`.
- Website tự tạo các nút lọc nhóm hàng từ dữ liệu KiotViet.
- Không cần tự gõ danh mục trong code.
- Vẫn chỉ lấy hàng đang kinh doanh (`isActive=true`).


## V9 - Lọc theo hãng điện thoại
Website tự nhận diện hãng từ tên sản phẩm để tạo bộ lọc:
Xiaomi (gồm Redmi/Poco), Apple, Samsung, OPPO (gồm OnePlus/realme),
vivo (gồm iQOO), HONOR, Huawei, Nubia/RedMagic, Motorola, Google, ASUS,
Sony, Nothing và Khác.

Không hiển thị thông tin KiotViet trên giao diện công khai.


## V10 - Hiển thị thuộc tính sản phẩm

- Tên sản phẩm hiển thị riêng.
- Thuộc tính của từng phiên bản hiển thị rõ:
  - Dung lượng
  - Màu sắc
- Ưu tiên lấy trực tiếp từ `attributes` của KiotViet.
- Nếu KiotViet không trả thuộc tính, website tự nhận diện từ tên phiên bản làm fallback.
- Mã sản phẩm vẫn không hiển thị.


## V11 - Bố cục kiểu trang chi tiết sản phẩm
- Ảnh sản phẩm bên trái.
- Tên máy và giá nổi bật bên phải.
- Màu sắc và dung lượng trình bày thành các lựa chọn.
- Tình trạng còn hàng đặt cạnh thông tin chính.
- Danh sách giá từng phiên bản nằm phía dưới.
- Mobile tự chuyển sang bố cục gọn hơn.


## V12 - Chọn màu/dung lượng tự đổi giá
- Bấm màu → tự chọn biến thể phù hợp và cập nhật giá.
- Bấm dung lượng → tự chọn biến thể phù hợp và cập nhật giá.
- Tổ hợp màu/dung lượng không tồn tại sẽ bị mờ và không bấm được.
- Khi đổi thuộc tính, tình trạng còn hàng cũng đổi theo đúng biến thể.
- Không cần reload trang.


## V13 - Ẩn thuộc tính của biến thể hết hàng
Khi bật "Chỉ hiện hàng còn tồn":
- Chỉ dùng các biến thể `onHand > 0` để tạo nút Màu sắc và Dung lượng.
- Màu/dung lượng chỉ tồn tại ở biến thể hết hàng sẽ không xuất hiện.
- Nếu một model không còn bất kỳ biến thể nào có hàng, ẩn luôn toàn bộ model.
- Giá và trạng thái chỉ lấy từ biến thể còn hàng.

Khi bỏ tick:
- Hiện lại đầy đủ cả biến thể hết hàng.


## V14 - Giao diện full width
- Desktop tăng chiều rộng nội dung lên tối đa 1560px.
- Màn hình rất rộng tăng lên tối đa 1760px.
- Card sản phẩm trải ngang, giảm khoảng trống 2 bên.
- Ảnh sản phẩm và khu vực thông tin được cân đối lại.
- Tablet/mobile vẫn responsive như cũ.


## V15 - Giao diện dạng shop/grid
- Desktop: 5 sản phẩm mỗi hàng giống trang thương mại điện tử.
- Ảnh lớn phía trên, tên sản phẩm, thuộc tính, giá, nút xem phiên bản.
- Bấm "XEM PHIÊN BẢN" để mở nhanh màu/dung lượng và đổi giá.
- Menu hãng dạng ngang.
- Responsive 4 / 3 / 2 cột tùy màn hình.


## V16 - Hiển thị đầy đủ màu và dung lượng
- Không còn chỉ hiển thị thuộc tính của biến thể mặc định.
- Card hiển thị tất cả màu còn hàng của sản phẩm.
- Card hiển thị tất cả dung lượng còn hàng của sản phẩm.
- Bấm màu hoặc dung lượng sẽ đổi giá theo đúng tổ hợp.
- Tổ hợp không tồn tại hoặc hết hàng sẽ tự ẩn.
- Nút "XEM PHIÊN BẢN" vẫn cho xem danh sách tất cả biến thể còn hàng.


## V17 - Vẫn hiển thị sản phẩm hết hàng
- Sản phẩm đang kinh doanh nhưng hết toàn bộ vẫn xuất hiện trên website.
- Card sẽ hiện trạng thái `Hết hàng`.
- Nếu sản phẩm còn ít nhất một biến thể có hàng và bật "Chỉ hiện hàng còn tồn":
  chỉ các biến thể còn hàng được hiển thị.
- Nếu sản phẩm hết toàn bộ:
  vẫn hiện card + thuộc tính/giá gần nhất để khách biết sản phẩm tồn tại, nhưng trạng thái là `Hết hàng`.
- Sản phẩm đã ngừng kinh doanh vẫn tiếp tục bị ẩn từ API.


## V18 - Màu dạng ô swatch
- Thuộc tính Màu không còn hiển thị bằng chữ trong từng nút.
- Mỗi màu là một ô màu trực quan.
- Màu đang chọn có viền cam + dấu tick.
- Tên màu đang chọn hiển thị dạng note bên cạnh, ví dụ `(Xanh)`.
- Dung lượng vẫn hiển thị bằng nút chữ như cũ.
- Bấm màu vẫn đổi đúng giá/biến thể.


## V19 - Luôn hiển thị đầy đủ
- Đã bỏ hoàn toàn checkbox `Chỉ hiện hàng còn tồn`.
- Website luôn hiển thị tất cả sản phẩm đang kinh doanh.
- Sản phẩm hết hàng vẫn xuất hiện và ghi `Hết hàng`.
- Các màu và dung lượng của sản phẩm hết hàng vẫn được giữ để khách xem.
- Sản phẩm đã ngừng kinh doanh vẫn được loại theo dữ liệu API.


## V21 - Mục Bán chạy mặc định
- Thêm mục `Bán chạy` và tự chọn mặc định khi khách mở website.
- Bán chạy được tính tự động từ số lượng bán trong hóa đơn 30 ngày gần nhất.
- Backend gọi API hóa đơn, cộng số lượng theo `productId`, chọn Top 20 biến thể bán nhiều nhất.
- Sản phẩm bán chạy có badge `BÁN CHẠY`.
- Khách vẫn có thể chuyển sang Tất cả hoặc các hãng điện thoại.
- Không hiển thị thông tin nguồn/API trên giao diện.


## V22 - Fix lỗi Bán chạy làm sập bảng giá
- Tính năng Bán chạy chỉ đọc tối đa 300 hóa đơn gần nhất trong 30 ngày.
- Nếu API hóa đơn lỗi hoặc quá chậm, website vẫn tải toàn bộ bảng giá bình thường.
- Nếu không lấy được dữ liệu bán chạy thì tab Bán chạy tự ẩn và mặc định chuyển sang Tất cả.
- Khi API hóa đơn hoạt động bình thường, Bán chạy vẫn là tab mặc định.


## V23 - Fix dứt điểm lỗi tải bảng giá
- Đã bỏ hoàn toàn việc gọi API hóa đơn khỏi `/api/products`.
- Bảng giá chỉ còn gọi API sản phẩm + nhóm hàng như bản ổn định trước đó.
- Mục `Bán chạy` được quản lý bằng file `bestsellers.js`.
- Có thể sửa danh sách tên máy bán chạy ngay trong `bestsellers.js`.
- Nếu danh sách không khớp/để trống, website tự lấy 12 mẫu đầu tiên để mục Bán chạy không bị rỗng.
- `Bán chạy` vẫn là tab mặc định khi khách vào web.


## V24 - API ổn định
- Bỏ hoàn toàn API nhóm hàng `/categories`; web phân hãng trực tiếp từ tên sản phẩm nên không cần gọi endpoint phụ.
- `/api/products` chỉ còn lấy sản phẩm, tồn kho, giá, ảnh và thuộc tính.
- Backend giữ dữ liệu thành công gần nhất trong bộ nhớ và trả lại nếu KiotViet lỗi tạm thời.
- Frontend lưu bảng giá gần nhất vào localStorage.
- Refresh API lỗi sẽ không còn xóa bảng đang hiển thị.
- Nếu mở web lúc API lỗi, trình duyệt sẽ dùng dữ liệu gần nhất đã lưu.
- Bán chạy vẫn dùng `bestsellers.js`, không gọi API hóa đơn.


## V25 - Fix lỗi render không hiện sản phẩm
Nguyên nhân:
- `render()` vẫn gọi `colorHex(color)` để vẽ ô màu.
- Trong bản V24, helper `colorHex()` bị thiếu.
- JavaScript dừng ngay sau khi cập nhật số lượng sản phẩm, nên màn hình hiện số mẫu nhưng không render card.

Bản V25 khôi phục `colorHex()` và giữ nguyên API ổn định của V24.


## V26 - Bán chạy thực tế 30 ngày, API riêng

- `/api/products` giữ nguyên luồng ổn định, không gọi hóa đơn.
- `/api/bestsellers` là endpoint riêng.
- Bán chạy = tổng `quantity` theo `productId` trong hóa đơn 30 ngày gần nhất.
- Loại hóa đơn có trạng thái chữ chứa `Đã hủy` / `Hủy` / `Cancel` / `Void`.
- API ranking cache 60 phút trong instance Vercel.
- HTTP cache: `s-maxage=3600, stale-while-revalidate=86400`.
- Trình duyệt giữ ranking gần nhất trong localStorage tối đa 48 giờ.
- Tab `Bán chạy` mở mặc định.
- Nếu API bán chạy lỗi:
  + có ranking cũ -> dùng ranking cũ;
  + chưa từng có ranking -> tự chuyển sang `Tất cả`.
- Lỗi API bán chạy không bao giờ làm hỏng `/api/products`.


## V27
- Khi mở website mặc định vào `Tất cả`.
- Danh sách hãng nằm ngay sau `Tất cả`.
- `Bán chạy` được chuyển thành mục phụ ở cuối danh sách hãng và có ký hiệu ★ để dễ nhận biết.
- Cơ chế tính bán chạy 30 ngày và cache của V26 giữ nguyên.


## V29 - Card gọn thật sự
- Ngoài danh sách chỉ hiển thị: ảnh, tên sản phẩm, giá.
- Không còn màu, dung lượng, tình trạng, nút trạng thái ở card ngoài.
- Bấm vào card mở popup chi tiết.
- Popup hiển thị đầy đủ màu sắc, dung lượng, giá, tồn kho.
- Bấm màu/dung lượng trong popup vẫn đổi giá theo biến thể.


## V30 - Fix bấm sản phẩm không mở chi tiết
Nguyên nhân:
- app.js chạy trước khi HTML của popup (productModal) được tạo.
- Các biến productModal / productModalContent nhận null.
- Vì vậy bấm card gọi openProductModal() nhưng hàm thoát ngay.

Đã sửa:
- Đưa app.js xuống cuối body, sau toàn bộ HTML popup.
- Khi JavaScript chạy, popup đã tồn tại trong DOM.
- Bấm card mở popup chi tiết bình thường.


## V31 - Popup chi tiết đẹp hơn
- Bố cục gần với trang sản phẩm mẫu: breadcrumb, ảnh trái, thông tin chính giữa, sản phẩm tương tự bên phải.
- Giá lớn, trạng thái rõ.
- Màu sắc dạng ô màu, dung lượng dạng nút.
- Có khối thông tin sản phẩm và khối thông tin phiên bản phía dưới.
- Sản phẩm tương tự lấy từ cùng hãng trong dữ liệu hiện có.
- Responsive cho tablet/mobile.
- Mặc định tab Tất cả; Bán chạy ở cuối nhóm lọc.


## V32 - Fix tách một model thành nhiều card
Nguyên nhân:
- Tên biến thể có màu ghép như `Xanh Dương` không bị hàm cũ loại khỏi tên model.
- Vì vậy `Honor WIN RT (...)` và `Honor WIN RT (...) - Xanh Dương` bị coi là hai sản phẩm khác nhau.

Đã sửa:
- Xác định Màu + Dung lượng trước.
- Tên model được chuẩn hóa bằng cách loại đúng thuộc tính của từng biến thể.
- Hỗ trợ màu nhiều từ như Xanh Dương, Xanh Lá, Titan Xám, Đen Bạc...
- Các biến thể cùng model sẽ gom lại thành một card và chỉ tách trong popup chi tiết.


## V33 - Chi tiết load thẳng trong trang
- Bấm sản phẩm không mở popup/cửa sổ nổi nữa.
- Danh sách sản phẩm được ẩn và trang hiển thị trực tiếp khu vực chi tiết.
- Có nút `← Quay lại danh sách`.
- Giữ nguyên giao diện chi tiết đẹp của V31.
- Màu sắc, dung lượng, giá và tồn kho vẫn đổi theo biến thể.


## V34 - Mở chi tiết như một trang riêng
- Bấm sản phẩm: chuyển ngay lên đầu trang chi tiết, không kéo xuống khu vực phía dưới.
- Chi tiết sản phẩm trở thành nội dung chính của trang.
- Không dùng popup.
- Nút quay lại đưa về danh sách.
- Nút Back của trình duyệt cũng quay về danh sách.


## V35 - Tự động lấy thông số kỹ thuật từ MobileCity

### Cơ chế
- Khi mở trang chi tiết sản phẩm, frontend gọi `/api/specs?name=<tên model>`.
- API nhận diện hãng, tải trang danh mục tương ứng trên MobileCity và tìm model gần nhất.
- Sau đó API tải trang sản phẩm và đọc các dòng bảng thông số kỹ thuật.
- Mỗi model dùng chung một bộ thông số; màu/dung lượng không tạo bộ thông số riêng.

### Cache và an toàn
- Vercel/CDN cache thông số 7 ngày, stale tối đa 30 ngày.
- Trình duyệt cache thông số từng model 30 ngày.
- Nếu MobileCity tạm lỗi nhưng đã từng lấy thành công, web tiếp tục dùng cache.
- Nếu không tìm thấy model đủ chính xác, API không tự lấy sản phẩm khác để tránh ghép sai thông số.
- Lỗi thông số không làm ảnh hưởng bảng giá, giá hoặc tồn kho.

### File mới
`api/specs.js`


## V36 - Fix thông số MobileCity không hiển thị
- Thử URL model trực tiếp trước khi crawl danh mục.
- Hỗ trợ các URL SEO đặc biệt như Honor WIN RT / Honor WIN / Honor WIN Turbo.
- Khi crawl danh mục, đọc cả link chỉ có ảnh, không còn phụ thuộc text trong thẻ `<a>`.
- Validate trang sản phẩm trước khi lấy thông số để tránh ghép sai model.
- Parser thông số đọc được table, dt/dd và các block label:value.
- Đổi cache client từ specs-v1 sang specs-v2 để bỏ cache lỗi của bản V35.


## V37 - Ghép thông số theo model nghiêm ngặt
- Không còn chỉ dựa vào độ giống tên.
- Bắt buộc hãng phải khớp.
- Các mã model như Z11, 15T, X300, K90... phải trùng.
- Các hậu tố quan trọng Pro / Pro Max / Ultra / Max / Mini / Plus / Turbo / RT... phải khớp tuyệt đối.
- Nếu không xác minh chắc chắn đúng model, không lấy thông số.
- Cache thông số đổi sang namespace mới để loại toàn bộ dữ liệu ghép sai của V35/V36.
- Màu, dung lượng, giá và tồn kho vẫn lấy từ dữ liệu cửa hàng, không lấy từ nguồn thông số.


## V38 - Chỉ hiển thị thông số chính
Chỉ giữ 10 nhóm thông số:
1. Màn hình
2. Hệ điều hành
3. Camera sau
4. Camera trước
5. CPU
6. RAM
7. Bộ nhớ trong
8. Thẻ SIM
9. Dung lượng pin
10. Thiết kế

Các thông số phụ khác từ nguồn sẽ không hiển thị.


## V39 - Tối ưu giao diện
- Trang chi tiết chuyển sang layout card hiện đại, cân đối hơn.
- Ảnh sản phẩm lớn hơn, giá nổi bật hơn.
- Màu/dung lượng dạng nút đẹp và dễ chọn.
- Khối sản phẩm tương tự, thông tin phiên bản và thông số kỹ thuật đồng bộ giao diện.
- Giảm đường kẻ thô, tăng khoảng trắng và bo góc.
- Mobile được tối ưu lại riêng.
- Chỉ thay đổi giao diện; logic giá, tồn kho, thông số và API giữ nguyên.


## V41 - Tối ưu mobile
- Header gọn và sticky.
- Trang chi tiết full chiều ngang mobile.
- Ảnh sản phẩm vừa màn hình, không quá cao.
- Màu/dung lượng dễ bấm hơn.
- Sản phẩm tương tự chuyển sang layout dọc rõ ràng, không còn chữ bị bó hẹp.
- Thông tin phiên bản, lưu ý và thông số kỹ thuật xếp dọc.
- Danh sách ngoài giữ 2 cột nhưng giảm kích thước ảnh/text hợp lý.


## V42 - Xây lại phần đầu trang
- Gom tiêu đề, tìm kiếm, bộ lọc hãng và số lượng vào một card điều khiển riêng.
- Search lớn, rõ và hiện đại hơn.
- Bộ lọc hãng chuyển sang dạng pill/chip.
- Tab active dùng màu cam thương hiệu.
- Bán chạy tách nhẹ bằng tông vàng/cam.
- Mobile cho phép kéo ngang danh sách hãng, không vỡ layout.


## V44 - Header website bán hàng
- Xây lại header cam giống bố cục website thương mại điện tử.
- Logo, Danh mục, khu vực Quy Nhơn, thanh tìm kiếm, Liên hệ, Cửa hàng, giỏ hàng, tài khoản.
- Ô tìm kiếm trên header dùng trực tiếp logic tìm sản phẩm hiện tại.
- Bỏ hoàn toàn giao diện tối.
- Khu đầu trang chuyển thành hero + khối bộ lọc hãng.
- Giữ nguyên toàn bộ API, giá, tồn kho, bán chạy, popup/chi tiết và thông số kỹ thuật.
- Mobile: header thu gọn thành logo vuông + search + tài khoản.


## V45 - Fix header thật sự
- V44 trước đó đóng gói nhầm index.html cũ nên giao diện không thay đổi.
- V45 thay toàn bộ index.html bằng header thương mại điện tử mới.
- Có thanh cam, logo, Danh mục, khu vực Quy Nhơn, search, Liên hệ, Cửa hàng, giỏ hàng, tài khoản.
- Không còn `Bảng giá Siêu Di Động` và không còn nút giao diện tối.
- Giữ nguyên toàn bộ app.js/API hiện có.


## V46 - Header tối giản
- Bỏ thanh cam đặc full chiều cao, chỉ giữ line cam nhận diện thương hiệu.
- Header nền trắng, logo trái, Danh mục + search giữa.
- Bỏ bớt location/contact/cart/account icon gây rối.
- Gom phần bên phải thành text tư vấn/cửa hàng đơn giản.
- Mobile: logo vuông + search.


## V47 - Card sản phẩm có CTA
- Thêm trạng thái `✓ Còn hàng` / `Hết hàng`.
- Thêm nút `Xem chi tiết` ngay trên card.
- Bấm nút hoặc bấm card đều mở trang chi tiết như hiện tại.
- Mobile thu gọn kích thước nút để không vỡ layout.


## V48 - Link riêng cho từng sản phẩm
- Khi bấm một sản phẩm, URL đổi thành dạng `/san-pham/ten-san-pham`.
- Có thể copy link chi tiết và gửi trực tiếp cho khách.
- Mở trực tiếp link sản phẩm sẽ tự tải đúng trang chi tiết.
- Nút Back của trình duyệt quay lại danh sách.
- Sản phẩm tương tự khi bấm cũng đổi sang URL của sản phẩm đó.
- `vercel.json` có rewrite `/san-pham/(.*)` về `index.html` để link trực tiếp không bị 404.


## V49 - Xây lại khu vực Sản phẩm nổi bật
- Gộp tiêu đề, trạng thái cập nhật, thương hiệu và số lượng thành một panel duy nhất.
- Loại bỏ 2 box cam bên phải gây cảm giác rời rạc.
- Bộ lọc hãng chuyển thành pill nhỏ, gọn và giống website e-commerce hơn.
- Cập nhật thời gian thành badge trạng thái riêng.
- Mobile kéo ngang hãng, không vỡ layout.


## V50 - Fix logo mobile
- Desktop giữ logo ngang Siêu Di Động.
- Mobile đổi sang logo vuông riêng, không crop logo ngang nữa.
- Căn lại kích thước header mobile để logo không méo hoặc bị cắt.


## V51 - Đổi ảnh theo màu/phiên bản
- Khi khách chọn ô màu khác, ảnh lớn tự chuyển sang ảnh của biến thể đó.
- Chọn dung lượng cũng cập nhật ảnh nếu biến thể dung lượng có ảnh riêng.
- Giá và tồn kho vẫn đổi đồng thời như trước.
- Dữ liệu ảnh lấy từ ảnh của từng variant KiotViet.
- Nếu KiotViet chỉ có một ảnh chung cho tất cả biến thể thì ảnh sẽ giữ nguyên.


## V53 - Fix font
- Dùng system font: Segoe UI / Roboto / Arial.
- Không dùng font ngoài nên không bị lỗi tải font.
- Giảm letter-spacing ở các nhãn nhỏ.
- Cân lại font-weight và line-height cho desktop/mobile.


## V55 - Danh mục lấy trực tiếp từ KiotViet
- Không hardcode `Điện thoại` và `Máy tính bảng`.
- Menu Danh mục được tạo từ `rootCategoryName/categoryName` của dữ liệu sản phẩm KiotViet.
- Hiển thị số sản phẩm trong từng danh mục.
- Khi KiotViet thêm/bớt/đổi tên danh mục, web tự cập nhật theo dữ liệu API.
- Chọn danh mục sẽ lọc sản phẩm theo đúng root category từ KiotViet.


## V56 - Khôi phục phân loại hãng
- Phần THƯƠNG HIỆU tự tạo lại từ dữ liệu sản phẩm KiotViet.
- Nhận diện hãng từ tên sản phẩm, tên danh mục và tên phiên bản.
- Giữ phân loại chính Điện thoại / Máy tính bảng từ KiotViet.
- Khi chọn Điện thoại, các nút hãng như HONOR, OPPO, vivo, Xiaomi... xuất hiện theo dữ liệu thực tế.
