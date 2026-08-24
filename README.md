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


## V61 - Thông số đúng theo mẫu
Chỉ lấy và hiển thị đúng các dòng:
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

- Giữ nguyên nội dung nhiều dòng từ trang nguồn.
- Bỏ các thông số phụ khác.
- Ưu tiên bản nội dung chi tiết hơn nếu nguồn có trường trùng.
- Đổi cache thông số để không dùng dữ liệu cũ.


## V62 - Fix parser thiếu Màn hình / Camera / Pin
Nguyên nhân V61: hàm chuẩn hóa tên sản phẩm cũ loại bỏ các từ `màn`, `camera`, `pin`,
nên parser vô tình làm mất chính nhãn thông số kỹ thuật.

V62:
- Tách riêng `normalizeSpecLabel()` cho nhãn thông số.
- Không còn loại bỏ `màn hình`, `camera`, `pin`.
- Nhận thêm các nhãn nguồn như `Công nghệ màn hình`, `Camera chính`,
  `Camera selfie`, `Vi xử lý`, `Chất liệu`, `Khung viền`.
- Vẫn chỉ hiển thị đúng 10 nhóm thông số chính.
- Đổi cache namespace để bỏ dữ liệu lỗi cũ.


## V63 - Tăng font và tối ưu giao diện
- Tăng font tổng thể nhẹ để dễ đọc hơn.
- Tăng rõ font card sản phẩm, giá, chi tiết và bảng thông số.
- Tăng khoảng trắng, bo góc và shadow để giao diện bớt thô.
- Bảng thông số desktop rộng label hơn, mobile vẫn giữ gọn.
- CTA card rõ hơn trên mobile.


## V64 - Chỉ đọc bảng Thông Số Kỹ Thuật từ link nguồn
- Không quét toàn bộ bài viết/mô tả trên trang nguồn.
- Chỉ lấy dữ liệu nằm trong khu vực/bảng `Thông Số Kỹ Thuật`.
- Nếu không tìm thấy bảng kỹ thuật thật sự, trả về trống thay vì lấy đại đoạn văn.
- Vẫn chỉ giữ đúng 10 nhóm thông số chính.
- Đổi cache namespace để loại dữ liệu sai cũ.


## V65 - Fix font giá
- Giảm font-weight giá từ 800 xuống 700.
- Tắt synthetic bold để chữ `đ` không bị thô/méo.
- Cân lại letter-spacing và line-height.
- Giữ màu đỏ và độ nổi bật của giá.


## V66 - Lọc sản phẩm theo giá
Thêm bộ lọc:
- Tất cả giá
- Dưới 5 triệu
- 5 - 10 triệu
- 10 - 15 triệu
- 15 - 20 triệu
- Trên 20 triệu

Bộ lọc dùng đúng mức giá đang hiển thị trên card sản phẩm và kết hợp được với hãng, Bán chạy và ô tìm kiếm.
Mobile có thể kéo ngang các mức giá.


## V68 - Fix header mobile
- Sửa lỗi logo nằm một hàng, search rơi xuống hàng dưới.
- Nguyên nhân là `.commerce-category-menu` vẫn chiếm một cột grid dù nút Danh mục bị ẩn.
- Mobile giờ chỉ còn 1 hàng: logo vuông + thanh tìm kiếm full chiều ngang.
- Ẩn hẳn các khối desktop trên mobile.
- Giảm khoảng trắng giữa header và bộ lọc.


## V69 - Sắp xếp + URL bộ lọc
Thêm sắp xếp:
- Mặc định
- Giá thấp đến cao
- Giá cao đến thấp
- Tên A → Z

Bộ lọc được đồng bộ vào URL:
- `category`
- `brand`
- `price`
- `sort`
- `q`

Ví dụ:
`/?brand=HONOR&price=5+-+10+triệu&sort=price-asc`

Có thể copy URL gửi khách; khi mở lại web sẽ giữ nguyên trạng thái lọc/tìm kiếm.

## V70
- Đổi nút `← Quay lại danh sách` thành `← Về trang chủ`.
- Khi bấm sẽ chuyển thẳng về `/`, không giữ URL sản phẩm hoặc bộ lọc cũ.

## V71 - Nút liên hệ Zalo
- Thêm nút Zalo nổi ở góc dưới bên phải trên desktop và mobile.
- Nội dung: `Chat Zalo / Nhân viên tư vấn`.
- Để gắn Zalo thật, mở `app.js` và sửa:
  `const SIEUDIDONG_ZALO_URL = "https://zalo.me/";`
  thành link Zalo của shop/nhân viên.


## V75 - Nút Zalo giữa màn hình
- Sửa đúng file `styles.css` đang được website sử dụng.
- Nút Zalo cố định ở giữa cạnh phải màn hình.
- Desktop: icon + chữ `Bạn cần hỗ trợ?`.
- Mobile: vẫn ở giữa cạnh phải; màn hình rất nhỏ chỉ hiện icon để không che nội dung.

## V79 - Thống kê truy cập
Trong `/admin` có thêm tab `Thống kê`:
- Lượt xem hôm nay / 7 ngày / 30 ngày / tổng.
- Khách truy cập gần đúng (Redis HyperLogLog), không lưu IP.
- Biểu đồ 30 ngày.
- Mobile / Desktop / Tablet.
- Top sản phẩm được xem.
- Top từ khóa tìm kiếm.
- Lượt bấm Zalo.
Dùng Redis hiện tại qua `REDIS_URL`. Nếu analytics lỗi, website công khai vẫn hoạt động bình thường.


## V80 - Fix tab Thống kê trắng màn hình
- Sửa xung đột `.hidden` và `.panel.active`.
- Bấm `Thống kê` sẽ hiện dashboard ngay.
- Bấm `Link thông số` quay lại đúng panel.
- Nếu API/Redis lỗi sẽ hiển thị thông báo lỗi cụ thể và nút `Thử lại`.
- Nếu chưa có dữ liệu sẽ hiện thông báo `Chưa có dữ liệu truy cập`, không để màn hình trắng.


## V81 - Fix Thống kê tải mãi
Nguyên nhân V79/V80 gọi Redis tuần tự quá nhiều lần cho 30 ngày, có thể vượt thời gian xử lý của Vercel/Redis Cloud.

V81:
- Dùng MGET để lấy 30 ngày chỉ trong 2 lệnh Redis.
- Các thống kê còn lại chạy song song.
- Thêm timeout 12 giây trên trang admin.
- Nếu API lỗi hoặc chậm sẽ hiện lỗi + nút Thử lại, không quay vô hạn.


## V82 - Tối ưu giao diện thống kê
- Tăng chiều rộng dashboard lên gần full màn hình desktop.
- Giảm khoảng trống hai bên.
- Tăng font KPI, tiêu đề, danh sách và thiết bị.
- Biểu đồ cao và dễ nhìn hơn.
- Desktop lớn dùng tối đa ~1700px.
- Tablet/mobile tự co thành 2 cột KPI rồi 1 cột nội dung.


## V83 - Fix nháy trang đăng nhập/admin khi load
- Ẩn toàn bộ nội dung quản trị ngay từ HTML trước khi JS kiểm tra session.
- Chỉ hiện `Link thông số / Thống kê` sau khi xác thực admin thành công.
- Nếu chưa đăng nhập chỉ hiện form đăng nhập.
- Không còn cảnh form đăng nhập và khung Link thông số cùng xuất hiện khi reload.


## V84 - Không hiện form đăng nhập trong lúc kiểm tra session
- Khi reload `/admin`, form đăng nhập không còn lóe lên 1-2 giây.
- Trong thời gian kiểm tra cookie/session chỉ hiện `Đang kiểm tra phiên đăng nhập...`.
- Nếu session còn hợp lệ: vào thẳng trang quản trị.
- Nếu session hết hạn: mới hiện form đăng nhập.


## V85 - Làm lại header
- Logo được đặt trong nền kem rất nhạt cùng tone thương hiệu, bớt cảm giác mảng cam bị tách khỏi header.
- Nút `Danh mục` đổi font-weight, line-height, padding và icon để tự nhiên hơn.
- Thanh tìm kiếm sáng, mềm và cân với logo/nút.
- `Tư vấn • Cửa hàng Quy Nhơn` thành phần tử thật, không còn pseudo-element.
- Desktop dùng layout 4 cột cân đối; desktop hẹp tự ẩn phần ghi chú.
- Mobile giữ layout gọn nhưng logo hòa với nền header hơn.


## V86 - Header clean
- Bỏ hoàn toàn khối nền kem quanh logo.
- Không dùng logo-wide dạng ảnh chữ nữa; thay bằng logo vuông + chữ SIÊU DI ĐỘNG bằng HTML.
- Nút Danh mục chuyển sang nền trắng, viền xám nhẹ, font tự nhiên hơn.
- Search trở thành thành phần chính, tổng thể giống header web bán hàng hơn.
- Mobile chỉ hiện icon vuông, không bị nền dư.


## V91 - Đường dẫn quản trị gọn
- Trang quản trị chính: `/admin`
- Đường dẫn cũ `/admin-specs` tự chuyển sang `/admin`
- Không đổi các API admin hiện tại.


## V92 - Fix thống kê sau khi đổi domain
- API thống kê không còn treo nếu Redis phản hồi chậm.
- Mỗi lệnh Redis timeout sau 2.5 giây và trả dữ liệu dự phòng.
- Trang admin tự thử kết nối API tối đa 3 lần.
- Giữ nguyên đường dẫn quản trị `/admin`.

## V93 - Thông báo đăng nhập thành công
- Khi nhập đúng mật khẩu quản trị, hiện thông báo xanh: “Mật khẩu chính xác — đăng nhập thành công!”
- Thông báo tự ẩn sau khoảng 2,2 giây.
- Không thay đổi cơ chế xác thực, session, thống kê hoặc Redis.


## V94 - SEO + bảo mật admin + thống kê nâng cao

### SEO
- Meta description, canonical, Open Graph.
- Product JSON-LD khi mở chi tiết sản phẩm.
- `robots.txt`.
- Sitemap động tại `/sitemap.xml`.

### Bảo mật admin
- Giới hạn 5 lần nhập sai / 15 phút theo IP.
- Đúng mật khẩu sẽ xóa bộ đếm sai.
- `/admin` và API admin có header no-cache / noindex / anti-frame.

### Thống kê nâng cao
- Khách đang online trong 5 phút gần nhất.
- Tổng lượt mở chi tiết sản phẩm.
- Theo dõi mức giá / hãng / sắp xếp được dùng nhiều.
- Vẫn giữ lượt xem, khách, Zalo, sản phẩm xem nhiều, từ khóa và thiết bị.

Không cần thêm biến môi trường mới; dùng Redis hiện tại.


## V95 - Gom sitemap theo model
- Sitemap không còn tạo URL riêng cho từng màu/dung lượng.
- Các biến thể như `Đen - 12/256`, `Trắng - 12/256` được gom về một URL model duy nhất.
- Ví dụ:
  `/san-pham/honor-win-5g-snapdragon-8-elite-gen-5-pin-10000mah`
- Giúp tránh sitemap có nhiều URL gần như trùng nội dung.


## V96 - Tab Sitemap trong quản trị
- Thêm tab `Sitemap` tại `/admin`.
- Hiển thị `https://sieudidong.vn/sitemap.xml`.
- Có nút Sao chép và Mở Sitemap.


## V97
- Mặc định mở Thống kê sau khi đăng nhập.
- Thứ tự tab: Thống kê → Link thông số → SEO.
- Thay tab Sitemap bằng bảng SEO có kiểm tra Sitemap, robots.txt và số URL.

## V98 - Thống kê khách duy nhất
- Sau khi đăng nhập `/admin`, tab Thống kê được mở mặc định.
- `Lượt xem` vẫn tính mọi lần mở/tải trang.
- `Khách` dùng visitor ID ổn định: cùng một trình duyệt/thiết bị truy cập nhiều lần vẫn chỉ tính 1 khách trong ngày/khoảng thời gian.
- Visitor ID được giữ bằng localStorage + cookie 1 năm để ổn định hơn.
- Thống kê loại thiết bị chuyển sang đếm khách duy nhất thay vì đếm số lần tải trang.
- Không dùng IP làm định danh khách.

## V99 - Fix nháy Link thông số khi mở Admin
- Link thông số bị hiện trước vì HTML của panel được render sẵn trước khi JavaScript kiểm tra phiên đăng nhập.
- Tất cả panel quản trị giờ ẩn ngay từ HTML ban đầu.
- Trong lúc xác thực chỉ hiện `Đang tải trang quản trị...`.
- Nếu phiên đăng nhập hợp lệ, panel đầu tiên được render là `Thống kê`.
- Nếu chưa đăng nhập, mới hiện form đăng nhập.

## V100 - Sửa đúng nguyên nhân Admin mở Link thông số
- `setLoggedIn(true)` trong V99 vẫn đang ép `adminCard` (Link thông số) thành active.
- V100 đổi nhánh xác thực thành công sang `analyticsCard`.
- Sau khi session được xác thực hoặc vừa đăng nhập: mở trực tiếp Thống kê.
- Link thông số chỉ mở khi bấm tab.

## V101 - So sánh sản phẩm
- Mỗi card có nút `So sánh`.
- Chọn tối đa 3 sản phẩm.
- Thanh so sánh nổi phía dưới, giữ lựa chọn bằng localStorage.
- Bấm `So sánh` mở bảng đối chiếu giá, tồn kho và thông số kỹ thuật.
- Thông số được lấy từ chính `/api/specs` và link nguồn đã gắn trong quản trị.
- Hỗ trợ desktop/mobile.


## V102 - Hiện nút So sánh ở trang chi tiết
- Nút `⇄ So sánh sản phẩm` hiển thị ngay trên trang chi tiết.
- Bấm để thêm/bỏ sản phẩm khỏi danh sách so sánh.
- Khi đã chọn, nút đổi thành `✓ Đã chọn so sánh`.
- Giữ nguyên thanh so sánh nổi phía dưới và bảng so sánh tối đa 3 sản phẩm.
- Có dòng gợi ý bên dưới giá để khách dễ nhận ra tính năng.


## V103 - Làm lại So sánh trên Mobile
- Mobile không còn dùng bảng ngang rộng khó đọc.
- Mỗi thông số trở thành một khối riêng; giá trị từng máy xếp dọc.
- Phần đầu hiển thị 2-3 card sản phẩm gọn để biết đang so máy nào.
- Thanh chọn ghi rõ `Đã chọn 1/3 • Chọn thêm ít nhất 1 máy`.
- Khi đủ 2 máy, nút đổi thành `So sánh ngay`.
- Nút trên trang chi tiết đổi thành `+ Thêm vào so sánh`.
- Ẩn nút Zalo khi cửa sổ so sánh đang mở để không che nội dung.

## V104 - Tinh gọn trang chi tiết
- Bỏ khối `Thông tin sản phẩm` vì lặp lại hãng / số phiên bản / tình trạng.
- Bỏ khối `Thông tin phiên bản` vì màu và dung lượng đã chọn trực tiếp phía trên.
- Chỉ giữ một dòng lưu ý ngắn trước phần `Thông Số Kỹ Thuật`.
- Tình trạng còn hàng vẫn hiển thị ở phần đầu trang.


## V107 - AI phân tích khi so sánh
- Trong cửa sổ So sánh có khối `AI phân tích`.
- Khách chọn nhu cầu: Cân bằng / Game / Camera / Pin / Giá-hiệu năng.
- AI chỉ được gửi tên, giá, tồn kho và các thông số `/api/specs` của những máy khách đang so sánh.
- API key chỉ nằm server-side, không đưa ra trình duyệt.
- Giới hạn khoảng 12 lần AI / IP / giờ để giảm lạm dụng và chi phí.
- Cần thêm Environment Variable trên Vercel:
  `OPENAI_API_KEY`
- Có thể thêm `OPENAI_COMPARE_MODEL`; mặc định dùng `gpt-5.6`.


## V108 - Chuyển AI so sánh sang Google Gemini
- Bỏ OpenAI khỏi tính năng phân tích so sánh.
- Backend gọi Gemini API; API key vẫn nằm server-side.
- Vercel Environment Variables:
  - `GEMINI_API_KEY`: bắt buộc.
  - `GEMINI_COMPARE_MODEL`: tùy chọn, mặc định `gemini-3.6-flash`.
- Sau khi thêm/chỉnh Environment Variables trên Vercel, Redeploy Production.


## V109 - Fix popup So sánh bị treo ở “Đang tải thông số”
- Mỗi `/api/specs` timeout sau 5 giây.
- Một máy lỗi vẫn mở được bảng so sánh; ô thiếu dữ liệu hiện `—`.
- Hiện cảnh báo và nút `Thử tải lại` nếu có máy chưa tải đủ thông số.
- Gemini vẫn phân tích phần dữ liệu lấy được.
- Frontend Gemini timeout sau 20 giây.
- Backend gọi Gemini timeout sau 18 giây.
- Không còn popup treo vô hạn.

## V110 - Fix lỗi popup So sánh bị đứng
- Nguyên nhân: code AI gọi `dialog.appendChild(aiBox)` trước khi biến `dialog` được khai báo.
- JavaScript dừng tại đó nên popup cứ hiện `Đang tải thông số...`.
- Đã chuyển khai báo `dialog`/`loading` lên đúng vị trí.
- Giữ nguyên Gemini, timeout 5 giây cho thông số và nút thử lại của V109.
- Thêm fallback để lỗi tải thông số không làm popup đứng.

## V111 - Gemini nhanh hơn + phân tích đầy đủ hơn
- Mặc định chuyển sang `gemini-3.7-flash`.
- Dùng `thinkingLevel: low` để giảm độ trễ nhưng vẫn giữ khả năng phân tích.
- Tăng output tối đa lên 1600 token để tránh kết luận bị cụt.
- Prompt bắt buộc đủ 4 phần: Nhận xét nhanh → Từng máy → Theo nhu cầu → Kết luận.
- Backend chờ tối đa 30 giây; frontend chờ tối đa 35 giây.
- Trong lúc chờ có trạng thái tiến trình rõ ràng.
- Nếu Gemini trả 429 hoặc lỗi API, giao diện báo nguyên nhân rõ hơn.
- Nếu Vercel đã có `GEMINI_COMPARE_MODEL`, hãy đổi thành `gemini-3.7-flash` hoặc xóa biến đó để dùng mặc định mới.

## V112 - Gemini tự fallback khi model quá tải
- Mặc định dùng `gemini-2.5-flash`.
- Nếu model chính lỗi 429/503/high demand, backend tự thử lần lượt model dự phòng.
- Model dự phòng mặc định: `gemini-2.5-flash,gemini-2.0-flash` (không gọi trùng model).
- Có thể cấu hình:
  - `GEMINI_COMPARE_MODEL`
  - `GEMINI_FALLBACK_MODELS` dạng danh sách phân tách bằng dấu phẩy.
- Frontend tự retry thêm 1 lần khi backend báo AI đang bận.
- Không hiển thị nguyên thông báo lỗi tiếng Anh của Google cho khách.
- Thông báo khách chỉ còn dạng tiếng Việt ngắn gọn.

## V113 - Sửa giới hạn AI phân tích
- Mỗi lần khách bấm `Gemini phân tích` sinh một `requestId`.
- Frontend retry lại cùng requestId nên không bị tính thêm lượt.
- Fallback model trong backend vẫn chỉ tính 1 lần bấm.
- Nới giới hạn từ 12 lên 60 lượt / IP / giờ.
- Thông báo rate limit đổi thành tiếng Việt nhẹ nhàng hơn.

## V115 - Tùy chỉnh / đào tạo AI trong trang quản trị
- Thêm tab `Tùy chỉnh AI` tại `/admin`.
- Quản trị có thể viết chỉ dẫn riêng cho Gemini.
- Chọn cách kết luận, độ dài phân tích, ưu tiên giá/cấu hình và giọng tư vấn.
- Có tùy chọn bắt buộc nêu điểm yếu, xét chênh lệch giá và cho phép kết luận hòa.
- Cấu hình lưu trong Redis, áp dụng ngay cho các lần phân tích mới.
- Có nút khôi phục mặc định.
- Đây là prompt/instruction tuning, không phải fine-tune model Gemini.

## V116 - Phát loa lời AI tư vấn
- Sau khi Gemini phân tích xong, hiện nút `🔊 Nghe tư vấn`.
- Dùng Web Speech API của trình duyệt để đọc tiếng Việt.
- Tự chọn voice `vi-VN` nếu thiết bị có.
- Bấm lần nữa khi đang đọc sẽ dừng.
- Đóng popup hoặc chạy phân tích mới sẽ tự dừng giọng đọc.
- Không cần thêm API key hay chi phí TTS.

## V117 - Nút nghe AI luôn nhìn thấy
- Nút `🔊 Nghe tư vấn` luôn nằm cạnh `✨ Gemini phân tích`.
- Trước khi có kết quả AI: nút hiển thị mờ và không bấm được.
- Sau khi Gemini phân tích xong: nút tự sáng và bấm để phát lời tư vấn.
- Đang đọc: nút đổi thành `⏹ Dừng đọc`.
- Mobile: dropdown nhu cầu nằm một hàng; hai nút `Gemini phân tích` và `Nghe tư vấn` nằm cạnh nhau bên dưới.

## V118 - Chỉ phát giọng tiếng Việt
- Chỉ sử dụng voice `vi-VN`, `vi-*` hoặc voice có tên Vietnamese/Tiếng Việt.
- Không còn fallback sang voice mặc định của hệ điều hành/trình duyệt.
- Chờ tối đa 2 giây cho danh sách voice tải xong.
- Nếu thiết bị không có giọng Việt, báo `Thiết bị chưa có giọng đọc tiếng Việt` và không phát sai ngôn ngữ.

## V121 - Chuẩn hóa thống kê khách duy nhất + lượt so sánh
- `Lượt truy cập` chỉ tính 1 lần / visitor / ngày, reload hay mở lại nhiều lần không tăng.
- Visitor ID lưu localStorage + cookie; nếu thiếu ID thì server dùng fingerprint băm từ IP + User-Agent làm fallback.
- Nhiều thiết bị cùng Wi-Fi vẫn ưu tiên ID riêng của từng trình duyệt, không gộp chỉ vì chung IP.
- Vẫn lưu raw pageviews riêng để chẩn đoán nhưng không dùng làm lượt truy cập chính.
- `Khách online` tiếp tục deduplicate theo visitor ID trong 5 phút.
- Thêm `Lượt tạo so sánh`: chỉ tính khi khách thực sự mở bảng so sánh với ít nhất 2 máy.
- Thêm bảng `Sản phẩm được so sánh nhiều` và `Cặp máy được so sánh nhiều`.

## V122 - Analytics Dashboard Pro
- Tối ưu lại bố cục dashboard: KPI quan trọng lên đầu, 4 ô/hàng desktop, 2 ô/hàng mobile.
- Phân biệt rõ khách duy nhất, lượt truy cập, online, mở sản phẩm, Zalo và so sánh.
- Card KPI có thanh nhấn màu, số lớn dễ quét nhanh.
- Biểu đồ và các bảng ranking đồng bộ khoảng cách, font, đường viền và responsive.
- Giữ nguyên logic thống kê V121; V122 chủ yếu tối ưu giao diện để không làm sai dữ liệu.

## V123 - Sắp xếp sản phẩm theo lượt tìm kiếm
- Khi khách mở trang, chế độ mặc định đổi thành `Tìm nhiều nhất`.
- Website lấy top từ khóa khách đã tìm từ Redis qua `/api/search-popular`.
- Sản phẩm khớp từ khóa có lượt tìm cao được đưa lên trước.
- Query dài/cụ thể được ưu tiên hơn query rất ngắn để tránh từ như `red` lấn át toàn bộ danh sách.
- Nếu khách tự chọn sắp xếp theo giá hoặc tên thì lựa chọn đó được ưu tiên.
- Khi khách đang gõ từ khóa tìm kiếm, không áp dụng sắp xếp phổ biến để tránh làm lệch kết quả tìm hiện tại.
- Có cache 6 giờ trên trình duyệt để trang vào là có thứ tự ngay, sau đó cập nhật nền.

## V124 - Thiết kế rõ cặp máy so sánh
- Cặp máy không còn hiển thị như một dòng văn bản dài.
- Tách rõ `MÁY A` và `MÁY B`, có huy hiệu `VS` ở giữa.
- Số lượt so sánh hiển thị thành badge/metric riêng ở bên phải.
- Cặp đứng đầu có rank nhấn màu cam.
- Toàn bộ khối cặp máy trải full-width để dễ đọc.
- Mobile chuyển sang layout dọc, vẫn giữ cấu trúc đối đầu rõ ràng.

## V125 - Quản trị nội dung SEO Google
- Thêm form trong Quản trị > SEO để tự chỉnh tên website, title, description, mô tả social, favicon/logo và khu vực.
- Có xem trước kết quả Google ngay trong quản trị.
- Lưu cấu hình vào Redis, không cần sửa code mỗi lần đổi nội dung quảng bá.
- Trang khách tự nạp cấu hình SEO và cập nhật title/meta/OG/favicon/Organization schema.
- Favicon mặc định dùng logo vuông Siêu Di Động.
- Không thêm chữ KiotvietWeb vào metadata website.

## V126 - Sửa mục SEO không hiện trong quản trị
- Sửa lỗi V125: panel SEO bị đặt ra ngoài thẻ `<main>` của trang quản trị.
- Chuyển toàn bộ panel SEO vào đúng khu vực quản trị.
- Đổi tên tab thành `SEO & Google` để dễ nhận biết.
- Khi bấm tab sẽ thấy ngay khối `Nội dung hiển thị trên Google` và phần xem trước.

## V131 - 2 Serverless Functions
- Toàn bộ API public gom vào `/api/[action].js`.
- Toàn bộ API admin giữ qua `/api/admin/[action].js`.
- Tổng entrypoint mới chỉ còn 2 Serverless Functions.
- Thêm `.vercelignore` để Vercel bỏ qua các file API cũ còn sót trong GitHub do cách Upload files không xóa file cũ.
- Không đổi URL API mà frontend đang gọi.

## V132 - Admin Pro + fix lưu SEO
- Sửa lỗi `showToast is not defined` khi lưu SEO.
- Thêm toast thông báo thành công/thất bại dùng chung cho trang quản trị.
- Nâng cấp giao diện quản trị: header sticky, tab sticky, card, form, button, khoảng cách và responsive.
- Tối ưu phần SEO, AI và Analytics nhìn đồng bộ và chuyên nghiệp hơn.
- Giữ kiến trúc V131: chỉ 2 Serverless Functions.

## V133 - Login UX rõ ràng
- Trang load admin hiển thị card `Đang kiểm tra phiên quản trị` thay vì màn hình mơ hồ.
- Phân biệt rõ: chưa có phiên, phiên hết hạn, server chậm, lỗi tải dữ liệu.
- Nút đăng nhập có trạng thái `Đang đăng nhập...` và khóa khi đang gửi request.
- Mật khẩu sai hiển thị cảnh báo đỏ ngay dưới form.
- Mật khẩu đúng hiển thị trạng thái xanh trước khi mở dashboard + toast thành công.
- Có timeout 8 giây cho đăng nhập/session và fallback rõ ràng sau 9 giây.
- Giữ kiến trúc 2 Serverless Functions của V131/V132.

## V134 - Font giao diện
- Đổi giao diện sang font hệ thống phổ biến: Segoe UI / Roboto / Helvetica / Arial.
- Áp dụng đồng nhất cho trang khách, trang quản trị, nút, ô nhập liệu và dropdown.
- Không tải Google Font bên ngoài, giúp hiển thị nhanh và ổn định hơn.

## V135 - Thống kê điện thoại khách truy cập
- Thu thập model điện thoại bằng User-Agent Client Hints khi trình duyệt hỗ trợ.
- Fallback sang User-Agent truyền thống trên Android.
- iPhone thường chỉ nhận diện được `iPhone (không xác định model)` do giới hạn của Safari/iOS.
- Mỗi visitor chỉ tính 1 lần vào thống kê model, tránh reload nhiều lần làm tăng số.
- Trang quản trị thêm `Điện thoại khách đang dùng` và `Hệ điều hành thiết bị`.
- Không làm tăng số Serverless Functions; vẫn giữ kiến trúc 2 functions.

## V136 - KPI dashboard compact
- Desktop rộng: 7 chỉ số nằm trên 1 hàng.
- Desktop vừa: tự xuống 4 cột.
- Mobile/tablet: 2 cột.
- Đổi tên ngắn gọn: Khách hôm nay, Truy cập hôm nay, Đang online, Xem sản phẩm...
- Toàn bộ số chính dùng cùng màu đen để giao diện thống nhất.
- Giữ nguyên logic thống kê và dữ liệu.

## V137 - Chat tư vấn bằng Gemini AI
- Thêm nút `Hỏi AI tư vấn` nổi trên website, nằm phía trên Zalo.
- Khách có thể hỏi máy theo tầm giá, pin, camera, hàng còn/hết và thông tin cơ bản của Siêu Di Động.
- AI chỉ nhận danh sách sản phẩm liên quan từ dữ liệu website hiện tại để hạn chế bịa giá/tồn kho.
- Tối đa 14 sản phẩm liên quan được gửi cho Gemini mỗi câu hỏi.
- Có lịch sử hội thoại ngắn để khách hỏi tiếp.
- Có câu hỏi nhanh: dưới 10 triệu, pin trâu, chụp ảnh đẹp, thông tin shop.
- Khi hỏi thông tin chưa cấu hình như địa chỉ chính xác/giờ mở cửa, AI hướng khách liên hệ Zalo thay vì bịa.
- Dùng chung `GEMINI_API_KEY`; có thể đặt thêm `GEMINI_CHAT_MODEL` nếu muốn.
- Không tăng số Serverless Functions: route mới chạy qua `/api/[action].js`.

## V138 - Fix nút AI Chat không bấm được
- Nguyên nhân: `app.js` chạy trước khi HTML của nút/panel AI Chat được trình duyệt tạo, nên listener không được gắn.
- Chuyển `app.js` xuống cuối `<body>`, sau toàn bộ HTML AI Chat và Zalo.
- Giữ nguyên UI và Gemini backend.
- Thêm marker `window.__AI_CHAT_V138_READY=true` để dễ kiểm tra.

## V139 - AI tư vấn trước, chuyển Zalo khi cần
- Nút hỗ trợ nổi không còn mở Zalo trực tiếp; bấm vào sẽ mở box AI trước.
- AI tự tư vấn sản phẩm và thông tin shop trước.
- Chỉ khi câu trả lời cần xác nhận giá/tồn kho/thông tin cửa hàng hoặc dữ liệu thiếu mới hiện khối `Cần nhân viên tư vấn trực tiếp?`.
- Khi đó khách mới thấy nút `Chat Zalo`.
- Có thống kê riêng lượt chuyển từ AI sang Zalo.
- Giữ nguyên 2 Serverless Functions.

## V140 - Một nút AI + Đào tạo AI chat trong quản trị
- Xóa nút đen `Hỏi AI tư vấn`; chỉ giữ một nút `Bạn cần hỗ trợ?`.
- Nút hỗ trợ dùng icon AI, mở AI chat trước; Zalo chỉ xuất hiện trong bước chuyển nhân viên.
- Tab quản trị đổi thành `Đào tạo AI`.
- Thêm khu `AI chat tư vấn khách` để chỉnh cách nói, câu chào, thông tin shop và quy tắc chuyển nhân viên.
- Câu chào public được tải từ cấu hình quản trị.
- AI chat đọc cấu hình mới trực tiếp từ Redis mỗi lần tư vấn.
- Không tăng Serverless Functions; vẫn giữ 2 functions.

## V141 - Mobile AI Chat + Zalo trực tiếp
- Mobile chuyển box chat thành bottom-sheet full width, không còn lơ lửng che thao tác.
- Khóa scroll nền khi chat mở.
- Tự điều chỉnh theo bàn phím mobile bằng VisualViewport.
- Composer Gửi tin nhắn sticky ở đáy, dễ bấm hơn.
- Nút hỗ trợ bên ngoài tự ẩn khi chat đang mở.
- Nếu khách gõ yêu cầu gặp nhân viên/tư vấn trực tiếp/Zalo, hệ thống hiện ngay nút `Nhắn Zalo ngay` và không bắt khách hỏi AI tiếp.
- Nút Zalo mở trực tiếp `https://zalo.me/0353105423`.

## V142 - Mobile Zalo trực tiếp + kéo thả nút AI
- Trong header box chat mobile có nút `Nhân viên` mở thẳng Zalo 0353105423.
- Khách không cần gõ yêu cầu mới thấy đường liên hệ trực tiếp.
- Nút hỗ trợ AI nổi trên mobile có thể kéo thả tự do.
- Vị trí nút được lưu bằng localStorage, lần sau giữ nguyên chỗ khách đã đặt.
- Sau thao tác kéo sẽ không vô tình mở chat.
- Vẫn giữ logic AI-first và 2 Serverless Functions.

## V143 - Logo Siêu Di Động cho nút AI + kéo thả đẹp hơn
- Thay icon chữ `AI` bằng logo vuông Siêu Di Động.
- Nút hỗ trợ chuyển sang nền trắng, logo cam rõ ràng, gọn hơn trên mobile.
- Vẫn kéo thả tự do.
- Sau khi thả, nút tự hít về mép trái/phải gần nhất để không nằm giữa màn hình che sản phẩm.
- Vị trí cuối cùng tiếp tục được lưu bằng localStorage.
- Màn hình rất nhỏ chỉ hiện logo tròn để tiết kiệm diện tích.

## V144 - Nút AI tròn kéo thả như mẫu
- Nút hỗ trợ ngoài website đổi thành hình tròn chỉ có logo Siêu Di Động.
- Bỏ hoàn toàn chữ `Bạn cần hỗ trợ?` trên nút nổi.
- Kéo thả tự do trên mobile.
- Sau khi thả vẫn tự hít về mép trái/phải gần nhất.
- Vị trí được lưu riêng bằng localStorage.
- Lần đầu hiện gợi ý `Kéo để di chuyển` trong vài giây.
- Chạm vào nút vẫn mở box AI chat như cũ.

## V145 - Fix nút tròn bị phóng to
- Nguyên nhân là CSS Zalo cũ dùng `#zaloConsultBtn` + `!important`, có độ ưu tiên cao hơn CSS nút AI mới.
- Ghi đè dứt điểm bằng `#zaloConsultBtn.ai-round-float`.
- Khóa kích thước nút ở 58x58px, logo 50x50px.
- JS kéo thả giờ set `left/top/right/bottom` bằng inline `!important`, nên CSS cũ không thể kéo nút về vị trí sai.
- Kéo thả và hít mép vẫn hoạt động.

## V146 - Mobile chat dễ nhận biết hơn
- Nút tròn logo Siêu Di Động có hiệu ứng pulse/nháy nhẹ để thu hút chú ý.
- Thêm nhãn `Chat tư vấn` nằm cạnh nút trên mobile.
- Nhãn tự chạy theo vị trí nút khi kéo thả và tự đổi sang bên trái/phải để không tràn màn hình.
- Khi mở box chat, nhãn tự ẩn.
- Hiệu ứng tắt tự động nếu thiết bị bật `prefers-reduced-motion`.

## V147 - Mobile chat focus fix
- Trên mobile, mở chat không tự bật bàn phím.
- Sau khi AI trả lời xong, ô nhập không tự focus lại nên bàn phím không tự bật lên.
- Khách muốn nhập câu tiếp theo thì tự chạm vào ô nhập.
- Khi chatbox đang mở, ẩn hoàn toàn nút tròn chat nổi và nhãn `Chat tư vấn`.
- Khi đóng chatbox, nút tròn xuất hiện lại đúng vị trí đã kéo trước đó.

## V148 - Hiệu ứng bong bóng chat kiểu Zalo
- Nút chat tròn nổi lên/xuống nhẹ theo nhịp.
- Có vòng sóng lan nhẹ quanh logo để thu hút chú ý.
- Thêm chấm đỏ thông báo nhỏ ở góc trên như bubble chat.
- Chấm đỏ tự ẩn sau khi khách mở chat lần đầu trong phiên.
- Nhãn `Chat tư vấn` có hiệu ứng thở nhẹ.
- Khi kéo thả, toàn bộ animation tạm dừng để thao tác mượt.
- Khi chatbox mở, nút và nhãn tiếp tục ẩn hoàn toàn như V147.

## V149 - Mobile không tự bật bàn phím + gợi ý Zalo ngay khi mở chat
- Chạm icon chat trên mobile chỉ mở chatbox, không tự gọi bàn phím.
- Trước lúc mở, hệ thống blur phần tử đang focus và tạm khóa textarea 250ms.
- Bàn phím chỉ xuất hiện khi khách chủ động chạm vào ô nhập.
- Ngay khi chatbox mở đã hiện `Cần nhân viên tư vấn trực tiếp?` cùng nút `Nhắn Zalo ngay`.
- Khi AI xác định câu hỏi cần nhân viên xác nhận, khối Zalo được nhấn mạnh hơn.

## V150
- Đổi nhãn cạnh icon chat trên mobile từ `Chat tư vấn` thành `Tư vấn ngay`.

## V151
- Xóa chữ/link `Nhân viên` khỏi thanh tiêu đề chat.
- Header chỉ còn thương hiệu AI và nút đóng, gọn hơn.
- Zalo được bố trí thành một khối CTA riêng bên dưới ô chat.
- Nút đổi thành `Chat Zalo với nhân viên`, rõ chức năng hơn.
- Mobile: nút Zalo chiếm toàn chiều ngang để dễ bấm.

## V152 - Fix lưu nội dung Đào tạo AI tư vấn chat
- Thêm nút riêng `Lưu AI tư vấn chat` ngay trong khung AI chat, không phải qua nút ở cột bên trái.
- Sau POST, trang quản trị GET lại cấu hình từ server để xác minh Redis đã lưu thật.
- Kiểm tra 4 trường: cách AI tư vấn, câu chào, thông tin shop, quy tắc chuyển nhân viên.
- Nếu server trả khác text vừa nhập, giao diện báo chính xác mục chưa được lưu.
- Nút `Lưu cấu hình AI` bên trái cũng dùng chung cơ chế lưu + xác minh mới.

## V153 - Fix nút chat nổi
- Xóa triệt để shortcut/chữ `Nhân viên` trên header chatbox.
- Nút Zalo với nhân viên chỉ còn ở khu vực hỗ trợ bên trong chatbox.
- Thêm nhãn `Tư vấn ngay` nằm sát bên nút chat nổi.
- Nhãn đi theo vị trí nút khi kéo thả vì nằm trong cùng floating control.
- Mobile có hiệu ứng nhịp nhẹ để khách dễ nhận biết.
- Khi mở chatbox, nhãn `Tư vấn ngay` được ẩn cùng nút chat.

## V154 - Font web cơ bản hiện đại
- Toàn bộ website dùng system UI font phổ biến: Segoe UI / Roboto / Helvetica / Arial.
- Không tải font ngoài nên nhanh và ổn định.
- Đồng bộ weight 400/600/700 để chữ bớt nặng.
- Tối ưu tên sản phẩm, giá, nút, bộ lọc, form, chat AI và trang quản trị.
- Mobile dễ đọc hơn với line-height và cỡ chữ cân đối.

## V155 - Fix Redis lưu Đào tạo AI
- API POST tự SET rồi GET lại Redis ngay trên server.
- So sánh toàn bộ field sau khi ghi; chỉ trả thành công khi Redis khớp dữ liệu.
- GET trả nguyên văn text đã lưu, không normalize text lần nữa.
- Trang quản trị chỉ báo thành công khi API xác nhận `persisted: true`.

## V156 - Đưa khung Zalo lên trên
- Khối `Muốn nhân viên tư vấn trực tiếp?` được chuyển lên trên phần gợi ý nhanh và ô nhập chat.
- Khách nhìn thấy nút `Chat Zalo với nhân viên` sớm hơn.
- Giữ nguyên toàn bộ logic AI, lưu đào tạo AI và giao diện V155.

## V157 - Quản trị gợi ý câu hỏi mẫu AI Chat
- Thêm mục `Gợi ý câu hỏi mẫu` trong Đào tạo AI > AI chat tư vấn khách.
- Mỗi dòng theo cú pháp `Tên nút | Câu hỏi gửi cho AI`.
- Cho phép tối đa 8 gợi ý hiển thị trên chatbox.
- Sau khi lưu, website tải danh sách gợi ý trực tiếp từ Redis qua `/api/ai-chat`.
- Không cần sửa code khi muốn đổi nút `Pin trâu`, `Chụp ảnh đẹp`, `Thông tin shop`...

## V158 - Redesign trang quản trị theo giao diện SaaS
- Sidebar tối bên trái, logo Siêu Di Động và menu dạng dashboard.
- Topbar trắng với tiêu đề trang, tìm nhanh Ctrl+K, profile và đăng xuất.
- Dashboard thống kê chuyển sang bố cục card hiện đại, giữ nguyên dữ liệu thật hiện có.
- Các khu Link thông số, Đào tạo AI và SEO giữ nguyên chức năng nhưng được bọc giao diện mới.
- Sidebar có chế độ thu gọn trên desktop và trượt mở trên mobile.
- Không thay đổi API hay số lượng Serverless Functions.

## V159
- Tăng cỡ font toàn bộ trang quản trị để dễ đọc hơn, vẫn giữ bố cục dashboard gọn.

## V160 - Sửa lỗi lưu Đào tạo AI
- Bỏ lỗi giả do frontend bắt buộc response POST phải có `persisted:true`.
- Sau khi POST vẫn GET đọc lại cấu hình và so sánh nội dung, nên chỉ báo thành công khi dữ liệu đọc lại đúng.
- API trả thêm `storage: redis` và `verified: true` sau khi SET + GET Redis thành công.

## V161 - Fix giao diện quản trị mobile
- Sidebar mặc định ẩn hoàn toàn trên mobile, chỉ mở khi bấm nút menu.
- Có overlay khi mở menu và tự đóng khi bấm ra ngoài.
- Nội dung quản trị full width, không còn bị sidebar đè lên form.
- Đào tạo AI chuyển đúng 1 cột trên mobile.
- Form, textarea, select, bảng thống kê và SEO không còn tràn ngang.
- Fix xung đột trạng thái `sidebar-collapsed` từ desktop khi chuyển sang mobile.

## V162 - Mobile admin navigation mới
- Bỏ hoàn toàn sidebar/drawer trên mobile vì gây che nội dung và xung đột breakpoint.
- Thay bằng thanh điều hướng cố định dưới màn hình: Thống kê / Thông số / AI / SEO.
- Mobile luôn full-width, không còn menu đen tràn vào nội dung.
- Tự xóa class sidebar cũ khi vào mobile.

## V163 - Fix thống kê điện thoại và hệ điều hành
- Backend tự parse User-Agent nếu frontend không gửi được model/OS.
- Dùng bộ key v2 để khách cũ được ghi nhận lại sau khi deploy bản sửa.
- Model điện thoại được thống kê riêng cho mobile/tablet.
- Hệ điều hành được ghi độc lập cho cả mobile và desktop.
- Bổ sung Windows, macOS, ChromeOS, Linux.
- Lưu ý: iPhone không cho website biết chính xác đời máy trên nhiều trình duyệt, nên có thể chỉ hiện `iPhone (không xác định model)`.

## V164 - Header trang chính mới
- Thiết kế lại header theo phong cách thương mại điện tử hiện đại giống bản demo đã duyệt.
- Desktop: thanh thông tin cam, logo lớn, danh mục, search, tư vấn, cửa hàng và menu điều hướng 2 tầng.
- Tablet: tự rút gọn các phần ít quan trọng.
- Mobile: logo + menu + search gọn; danh mục mở bằng drawer riêng.
- Nút `Tư vấn` trên header gọi trực tiếp AI chat hiện có.
- Giữ nguyên search suggestions và category dropdown hiện tại.
- Header sticky khi cuộn.

## V165 - Cân đối lại header desktop
- Thu gọn thanh cam trên cùng.
- Cân lại 4 vùng logo / danh mục / search / tư vấn-cửa hàng.
- Search rộng hơn và nằm đúng trọng tâm.
- Thu nhỏ icon, text phụ và chiều cao hàng chính.
- Căn hàng menu dưới thẳng theo cùng lưới với hàng trên.
- Xóa phần text nhỏ dư gây lệch bố cục.

## V166 - Fix dứt điểm lưu Gợi ý câu hỏi mẫu
- 5 trường AI chat chuyển sang Redis HASH riêng `ai:chat:settings:v2`.
- `Gợi ý câu hỏi mẫu` không còn phụ thuộc object cấu hình AI cũ.
- POST ghi object tổng + hash chat, sau đó đọc lại và xác minh.
- Public AI chat ưu tiên đọc hash v2, fallback dữ liệu cũ để không mất cấu hình.
- So sánh textarea chuẩn hóa CRLF/LF để không báo lỗi giả do xuống dòng.

## V167 - Khung nhân viên/Zalo gọn hơn
- Đổi thành một hàng: `Cần nhân viên hỗ trợ?` + nút `Nhắn Zalo`.
- Bỏ mô tả dài để phần cuối chatbox nhẹ hơn.
- Nút Zalo chuyển sang nền trắng viền xanh, không còn khối xanh quá nặng.
- Mobile giữ chiều cao khoảng 44px và không chiếm nguyên hàng lớn.

## V168 - Fix thanh menu mobile không click được
- Nguyên nhân: JavaScript tìm `#mobileAdminNav` trước khi HTML của thanh menu được tạo nên biến nhận `null`.
- Khởi tạo sự kiện sau `DOMContentLoaded`.
- Bổ sung fallback chuyển panel trực tiếp.
- Tăng vùng nhận touch/click và tắt pointer-event trên icon/chữ con để bấm đâu trên nút cũng nhận.

## V169 - Tách riêng lưu Đào tạo AI
- Tạo endpoint riêng `/api/admin/ai-chat-training` trong catch-all API hiện có, không tăng số Serverless Functions.
- 5 ô Đào tạo AI lưu vào key riêng `ai:chat:training:v3`.
- Nút `Lưu AI tư vấn chat` không còn đi qua object cấu hình so sánh AI cũ.
- Server SET rồi GET lại cùng key trước khi báo thành công.
- AI chat ngoài website đọc trực tiếp key v3, fallback dữ liệu cũ nếu chưa có.
- Giải quyết lỗi lặp lại `Thông tin shop` / `Gợi ý câu hỏi mẫu` không lưu.

## V170 - Đưa nhân viên hỗ trợ lên đầu box chat
- Chuyển khung `Cần nhân viên hỗ trợ? / Nhắn Zalo` lên ngay dưới header của chatbox.
- Khách nhìn thấy lựa chọn liên hệ nhân viên ngay khi mở chat.
- Tin nhắn AI, gợi ý câu hỏi và ô nhập nằm phía dưới.

## V171 - Fix lỗi chatbox V170
- Nguyên nhân V170: khi di chuyển khung Zalo, HTML bị cắt nhầm ở div lồng nhau nên khung nhân viên bọc luôn vùng tin nhắn.
- Dựng lại toàn bộ cấu trúc chatbox đúng DOM.
- Thứ tự chuẩn: Header → Nhân viên/Zalo → Tin nhắn AI → Gợi ý → Ô nhập.
- Khung Zalo nằm đúng một hàng, không còn kéo dài hoặc lệch sang trái.

## V172 - Tăng font header
- Tăng chữ menu chính lên khoảng 14px và font-weight 600.
- Tăng chữ thương hiệu/header, nút Danh mục và ô tìm kiếm.
- Tăng nhẹ chữ Tư vấn/Cửa hàng và thanh cam trên cùng.
- Chỉ áp dụng desktop để không làm vỡ bố cục mobile.

## V173 - AI lấy tồn kho trực tiếp từ website
- Tình trạng hàng gửi cho AI lấy trực tiếp từ PRODUCTS đang hiển thị trên web.
- Sản phẩm được tính `Còn hàng` nếu có ít nhất một biến thể có tồn kho > 0.
- Khi khách hỏi còn/hết hàng, server trả lời xác định từ dữ liệu web, không cho Gemini suy diễn.
- Prompt bắt buộc coi giá/tồn kho website là nguồn sự thật ưu tiên cao nhất.
- Nếu web ghi Còn hàng, AI không được nói Hết hàng hoặc bắt khách xác nhận lại qua Zalo.
- Chỉ chuyển nhân viên khi website thật sự không có dữ liệu cần hỏi hoặc khách chủ động yêu cầu.

## V174 - Không mất nội dung Đào tạo AI khi load
- Sửa race condition: cấu hình AI chung và AI chat được tải tuần tự.
- `ai:chat:training:v3` là nguồn chính duy nhất cho 5 ô AI chat; hash v2 chỉ fallback.
- Sau khi lưu/đọc thành công, trình duyệt giữ một bản backup cục bộ.
- Nếu API tải lỗi tạm thời, giao diện không xóa nội dung đang có.
- Chỉ dùng backup trình duyệt nếu form đang hoàn toàn trống.

## V175 - Fix nhãn nút chat mobile ở mép màn hình
- Nút chat mobile giữ dạng tròn.
- Nếu kéo icon sang nửa phải màn hình, chữ `Tư vấn ngay` tự chuyển sang bên trái icon.
- Nếu kéo icon sang nửa trái, chữ tự chuyển sang bên phải.
- Không còn tình trạng chữ bị cắt/che khi icon nằm sát mép phải.
- Giữ nguyên khả năng kéo thả.

## V176 - Đồng bộ tồn kho AI với card website
- AI không còn tự cộng tồn của tất cả biến thể.
- AI gọi đúng `getDefaultVariantForGroup(group)` giống hệt card sản phẩm trên trang chính.
- `inStock` của AI được tính từ đúng `onHand` của biến thể mà card website đang hiển thị.
- Tăng độ ưu tiên khớp tên máy khách hỏi để tránh lấy nhầm sản phẩm gần giống.

## V177 - Thay icon nút AI chat bằng robot Siêu Di Động
- Chỉ thay icon nút chat nổi ngoài website.
- Logo header, favicon và logo thương hiệu vẫn giữ nguyên.
- Icon mới: `/assets/ai-chat-robot.png`.
- Giữ chữ `Tư vấn ngay`, hiệu ứng và chức năng kéo thả.
- Sửa luôn selector V175 để nhãn tự đổi trái/phải đúng theo vị trí nút chat.

## V178
- Xóa chữ `Tư vấn ngay` nằm bên ngoài icon chat nổi.
- Chỉ giữ icon robot AI Boxchat vì nội dung tư vấn đã có sẵn trong icon.
- Không thay đổi chức năng mở chat và kéo thả.

## V179 - Thay icon chatbox
- Thay đúng icon nút chat AI ngoài website bằng hình robot `TƯ VẤN NGAY`.
- Không tạo thêm icon mới trên giao diện.
- Không thay logo website/header/favicon.
- Bỏ toàn bộ nhãn chữ bên ngoài icon.
- Giữ nguyên click mở chatbox và kéo thả trên mobile.

## V180 - Thay icon chat AI trong quản trị
- Thêm mục `Icon chat AI` trong tab Đào tạo AI.
- Chọn ảnh, xem trước, lưu và khôi phục mặc định.
- Ảnh tự thu về 256×256 và nén trước khi lưu.
- Lưu Redis, đổi icon không cần sửa code/GitHub/deploy lại.
- Website tự tải icon mới từ `/api/ai-chat-icon`.
- Không tăng số Serverless Functions vì dùng catch-all API hiện có.

## V181 - Fix icon chat tròn
- Nút chat và ảnh bên trong đều ép `border-radius: 50%`.
- Thêm `overflow: hidden` để không còn lộ 4 góc ảnh vuông.
- Thêm mask tròn để cắt phần nền đen/vuông ngoài icon.
- Preview icon trong quản trị cũng hiển thị dạng tròn giống ngoài website.

## V182 - Hiện rõ chức năng đổi icon trong quản trị
- Chuyển mục đổi icon vào ngay đầu khung `AI chat tư vấn khách`.
- Có tiêu đề `Ảnh icon nút chat` và badge `TÙY CHỈNH`.
- Giữ nguyên chọn ảnh, xem trước, lưu và khôi phục mặc định.
- Không còn nằm ở một card riêng dễ bị bỏ sót.

## V183 - Hiệu ứng nút chat AI
- Icon chat nháy nhẹ theo chu kỳ.
- Có 2 vòng sáng màu cam lan ra như bong bóng chat.
- Không làm méo icon tròn.
- Hover sẽ tạm ngừng hiệu ứng để dễ bấm.
- Tôn trọng `prefers-reduced-motion`.

## V184 - Fix hiệu ứng nháy icon chat
- V183 dùng transform nên có thể xung đột với logic kéo thả.
- Vòng pseudo cũ bị `overflow:hidden` cắt mất nên gần như không thấy.
- V184 chuyển sang nháy bằng brightness + box-shadow ngay trên icon.
- Mobile dùng chu kỳ 1.45 giây để dễ nhận biết hơn.
- Không dùng transform nên không ảnh hưởng kéo thả.

## V185 - Nháy mạnh + Zoom In/Zoom Out icon chat
- Icon thu nhỏ xuống 92%, zoom lên tối đa 118%, rồi thu lại.
- Có 2 nhịp zoom liên tiếp để gây chú ý.
- Glow màu cam và chớp sáng đồng bộ với zoom.
- Mobile chạy nhanh hơn (1.55 giây/chu kỳ).
- Animation nằm trên logo con, không dùng transform của nút cha nên vẫn giữ kéo thả.

## V186 - Header desktop rộng hơn
- Mở rộng header desktop tối đa 1600–1680px.
- Giảm khoảng trắng hai bên giống bố cục mẫu.
- Ô tìm kiếm rộng hơn và chiếm phần không gian chính.
- Thanh menu dưới mở rộng đồng bộ.
- Mobile giữ nguyên.

## V187 - Header chữ lớn và cân đối hơn
- Tăng font thanh thông tin trên cùng.
- Tăng chữ logo, Danh mục, ô tìm kiếm.
- Tăng chữ Tư vấn/Cửa hàng bên phải.
- Tăng font toàn bộ menu điều hướng.
- Tăng nhẹ chiều cao 2 hàng header để chữ không bị chật.
- Giữ nguyên bố cục mobile.

## V188 - Nổi bật tình trạng hàng
- Còn hàng: badge xanh, chữ đậm, viền xanh nhẹ.
- Hết hàng: badge xám rõ ràng, chữ đậm hơn.
- Tăng kích thước badge để khách nhìn trạng thái ngay.
- Tự nhận diện trạng thái theo chữ hiển thị, không phụ thuộc hoàn toàn vào class cũ.

## V189 - Trạng thái hàng cạnh giá
- Bỏ badge Còn hàng/Hết hàng ở mép phải dòng tên sản phẩm.
- Đưa badge sát ngay bên phải giá bán trong trang chi tiết.
- Còn hàng dùng badge xanh; hết hàng dùng badge xám.
- Badge cập nhật theo đúng màu/dung lượng khách đang chọn.
- Mobile tự xuống dòng nếu không đủ chiều ngang.

## V190 - Cân lại giao diện chi tiết sản phẩm
- Desktop chia lại 3 cột: ảnh / thông tin / sản phẩm tương tự.
- Tăng khoảng thở giữa các khối, giảm cảm giác dồn cục ở giữa.
- Giá + trạng thái hàng nằm gọn trên cùng một hàng.
- Hai nút Liên hệ mua hàng / Thêm vào so sánh cân bằng cùng kích thước.
- Cột sản phẩm tương tự gọn, ảnh và chữ cân hơn.
- Mobile tự chuyển về 1 cột.

## V191 - Thu gọn phần chi tiết sản phẩm
- Giảm khoảng trống phía dưới hai nút Liên hệ mua hàng / Thêm vào so sánh.
- Giảm nhẹ chiều cao vùng ảnh sản phẩm.
- Thu gọn padding trên/dưới của card.
- Cột sản phẩm tương tự cũng gọn hơn để ba cột cân chiều cao.
- Không thay đổi bố cục mobile.

## V192 - Tra cứu bảo hành qua KiotViet
- Thêm mục `Tra cứu BH` trên menu desktop và `Tra cứu bảo hành` trên mobile.
- Khách nhập số điện thoại mua hàng.
- Server tìm khách hàng KiotViet theo `contactNumber`, sau đó lấy hóa đơn theo `customerIds`.
- Hiển thị máy đã mua, ngày mua, ngày hết bảo hành, số ngày còn lại và IMEI/Serial nếu KiotViet có dữ liệu.
- Mã hóa đơn được che bớt trên giao diện công khai.
- Mặc định bảo hành 12 tháng và 1 đổi 1 tháng đầu; có thể đổi bằng `WARRANTY_MONTHS`, `EXCHANGE_MONTHS`.
- Bắt buộc cấu hình `KIOTVIET_RETAILER`, `KIOTVIET_CLIENT_ID`, `KIOTVIET_CLIENT_SECRET` trên Vercel.
- Client secret chỉ được sử dụng ở server API, không đưa xuống trình duyệt.

## V193 - Fix nút Tra cứu bảo hành
- Sửa lỗi nút `Tra cứu BH` bấm không mở được.
- Nguyên nhân: app.js chạy trước khi HTML của modal bảo hành được tạo nên JS thoát sớm.
- V193 chờ `DOMContentLoaded` rồi mới gắn sự kiện.
- Thêm trạng thái `Đang tra cứu...` và hiển thị lỗi API rõ hơn.
- Giữ nguyên API KiotViet và giao diện tra cứu của V192.

## V194 - Ghi rõ chính sách 1 đổi 1
- Đổi dòng `Mốc 1 đổi 1 lỗi NSX` thành nội dung rõ ràng:
  `1 đổi 1 trong tháng đầu tiên nếu có lỗi do nhà sản xuất`.
- Vẫn hiển thị ngày áp dụng đến ngay bên dưới.

## V195 - Ẩn tên KiotViet khỏi giao diện khách
- `Dữ liệu được đối chiếu trực tiếp từ hóa đơn KiotViet.` → `Dữ liệu được đối chiếu trực tiếp từ hệ thống.`
- Trạng thái tải đổi thành `Đang đối chiếu dữ liệu từ hệ thống...`
- Phần kết nối API bên trong vẫn giữ nguyên.

## V196 - Tối ưu menu mobile và Tra cứu bảo hành
- Bỏ nút `Tra cứu bảo hành` khỏi menu mobile.
- Menu chỉ giữ `Tư vấn ngay` làm CTA chính nên gọn hơn.
- Thêm nút `Tra cứu bảo hành` độc lập bên ngoài menu trên mobile.
- Nút bảo hành nổi cố định phía dưới bên phải, khách có thể mở tra cứu mà không cần vào menu.
- Desktop vẫn giữ `Tra cứu BH` trên thanh điều hướng.

## V197 - Nút tư vấn mobile mở thẳng Zalo
- Nút trong menu mobile đổi thành `Nhắn Zalo tư vấn ngay`.
- Bấm nút sẽ chuyển trực tiếp tới Zalo: `https://zalo.me/84901234567`.
- Chặn sự kiện cũ để không mở AI chatbox.
- Nút AI chat nổi trên website vẫn hoạt động riêng như trước.

## V198 - Đưa Tra cứu bảo hành lên thanh trên mobile
- Chuyển nút Tra cứu bảo hành từ góc dưới lên góc phải thanh trên.
- Thu gọn thành dạng pill để không chiếm diện tích màn hình.
- Bỏ dòng mô tả phụ trên nút ở mobile.
- Icon AI chat tiếp tục nằm góc dưới và không còn đụng nút bảo hành.
- Chức năng tra cứu bảo hành giữ nguyên.

## V199 - Tra cứu bảo hành thành trang riêng
- `Tra cứu BH` không còn mở popup/cửa sổ trên trang chủ.
- Desktop và mobile đều chuyển tới `/tra-cuu-bao-hanh.html`.
- Trang riêng có form số điện thoại, kết quả bảo hành và chính sách 1 đổi 1.
- API `/api/warranty-lookup` giữ nguyên nên vẫn đối chiếu dữ liệu hệ thống như trước.
- Trang chủ nhẹ và gọn hơn vì đã bỏ modal bảo hành.

## V200 - Thiết kế lại Danh mục mobile
- Drawer chuyển thành dạng panel trượt từ trái, cao full màn hình.
- Header có logo Siêu Di Động + tiêu đề + nút đóng riêng.
- Mỗi danh mục có icon, khoảng cách đều và mũi tên điều hướng.
- Nút Zalo được tách xuống footer, rõ ràng nhưng không chiếm phần danh mục.
- Menu không còn dạng hộp nổi ngắn, dồn chữ và khó nhìn như bản cũ.

## V201 - Đưa Tra cứu bảo hành vào Danh mục mobile
- Thêm `Tra cứu bảo hành` thành một mục riêng trong menu Danh mục.
- Có dòng phụ `Kiểm tra bằng số điện thoại`.
- Bấm sẽ mở trang riêng `/tra-cuu-bao-hanh.html`.
- Xóa nút Tra cứu bảo hành nổi riêng ngoài menu trên mobile.
- Desktop vẫn giữ mục Tra cứu BH trên thanh điều hướng.

## V202 - AI chat tra cứu bảo hành
- AI nhận biết các câu hỏi như `máy tôi còn bảo hành không`, `tra cứu bảo hành`, `1 đổi 1 còn không`.
- Nếu khách chưa gửi SĐT, AI chỉ hỏi đúng một câu xin số điện thoại mua hàng.
- Nếu khách gửi SĐT ở tin nhắn kế tiếp, AI hiểu ngữ cảnh và tự tra cứu.
- Kết quả lấy trực tiếp từ hệ thống bảo hành dùng chung với trang `/tra-cuu-bao-hanh.html`.
- AI trả lời máy đã mua, ngày mua, ngày hết bảo hành, số ngày còn lại và mốc 1 đổi 1 nếu còn áp dụng.
- Dữ liệu bảo hành và số điện thoại KHÔNG được gửi sang Gemini; xử lý xác định hoàn toàn ở server.
- Nếu một SĐT có nhiều máy, AI liệt kê các máy; nếu câu hỏi có tên máy thì ưu tiên đúng máy đó.

## V203 - Xem chính sách bảo hành chi tiết
- Box mặc định chỉ hiển thị quyền lợi bảo hành ngắn gọn.
- Thêm nút `Xem chính sách chi tiết`.
- Khi mở sẽ hiển thị thời hạn Mainboard, nguồn/màn hình/camera, phụ kiện, đổi máy 30 ngày và hỗ trợ phần mềm.
- Có riêng phần `Trường hợp không bảo hành`.
- Có thể bấm `Thu gọn chính sách` để đóng lại, tránh trang tra cứu quá dài trên mobile.

## V204 - Thiết kế lại header trang bảo hành
- Đưa logo Siêu Di Động thật vào header thay cho phần chữ đứng riêng.
- Logo + tên thương hiệu nằm bên trái, cân đối như header website chính.
- Nút Trang chủ chuyển sang dạng nút nhỏ bên phải.
- Mobile thu gọn chiều cao và font để không chiếm diện tích.
- Giữ đường cam thương hiệu phía trên nhưng mảnh hơn.

## V205 - Đồng bộ chữ bộ lọc
- Bỏ kiểu viết HOA toàn bộ ở các tiêu đề bộ lọc.
- Đồng bộ thành: `Thương hiệu`, `Mức giá`, `Sắp xếp`.
- Tên thương hiệu hiển thị thống nhất: `Honor`, `Oppo`, `vivo`, `Xiaomi`.
- Các nút giá và nút lọc giữ kiểu chữ thường tự nhiên, không tự động uppercase.
- Desktop và mobile dùng cùng một quy tắc typography.

## V206 - Sửa AI không hiểu `kiểm tra bh`
- Nhận diện `bh` là viết tắt của `bảo hành`.
- Hiểu: `kiểm tra bh`, `check bh`, `tra cứu bh`, `còn bh`, `hết bh`, `bao hanh`, `bảo hành`.
- Với yêu cầu bảo hành chưa có SĐT, AI bắt buộc xin SĐT thay vì đẩy khách sang Zalo.
- Sau khi AI xin SĐT, khách chỉ cần gửi số điện thoại ở tin nhắn kế tiếp; hệ thống vẫn giữ đúng luồng tra cứu bảo hành.
- Chỉ khi API tra cứu thực sự lỗi mới báo hệ thống đang tạm bận.

## V207 - Sửa lỗi Unauthorized khi lưu Đào tạo AI
- Đồng bộ thời hạn phiên quản trị thành 7 ngày.
- Endpoint Đào tạo AI dùng cùng cơ chế xác thực với các mục quản trị khác.
- Khi gặp HTTP 401, giao diện kiểm tra lại phiên và thử lại một lần.
- Nếu phiên thật sự hết hạn, giao diện đưa về đăng nhập và báo rõ `Phiên đăng nhập đã hết hạn` thay vì chỉ hiện `Unauthorized`.
- Nội dung đang nhập được backup ngay trên trình duyệt để tránh mất dữ liệu khi phiên hết hạn.

## V208 - Gọn thông tin đổi máy trong kết quả bảo hành
- Bỏ câu điều kiện `1 đổi 1 trong tháng đầu tiên nếu có lỗi do nhà sản xuất` khỏi từng thẻ sản phẩm.
- Thẻ sản phẩm chỉ hiển thị mốc `Hỗ trợ đổi máy đến: DD/MM/YYYY`.
- Điều kiện và phạm vi áp dụng được giữ tập trung trong mục `Chính sách bảo hành` phía dưới.
- Tránh lặp nội dung và giúp kết quả tra cứu dễ đọc hơn trên mobile.

## V209 - Đóng ngữ cảnh bảo hành sau khi tra cứu
- Sửa lỗi sau khi tra cứu bảo hành xong, mọi tin nhắn tiếp theo vẫn bị hiểu là đang tra cứu bảo hành.
- Lịch sử chat không còn tự kích hoạt luồng bảo hành chỉ vì trước đó từng nhắc `bảo hành`.
- Chỉ giữ ngữ cảnh bảo hành khi AI vừa yêu cầu SĐT và tin nhắn kế tiếp thực sự là một số điện thoại.
- Sau khi tra cứu xong server trả `warrantyPending:false` và `warrantyCompleted:true`.
- Tin nhắn như `hihi`, `pin trâu`, `tư vấn máy dưới 10 triệu` sau đó sẽ trở lại AI tư vấn bình thường.
- Nếu khách muốn kiểm tra lại, chỉ cần hỏi `kiểm tra BH`, `còn bảo hành không`... để mở luồng mới.

## V210 - Đảo vị trí header trang bảo hành
- Nút Trang chủ chuyển sang bên trái.
- Logo + tên SIÊU DI ĐỘNG chuyển sang bên phải.

## V211 - Bỏ nút Danh mục dư ở header
- Xóa nút `Danh mục` ở hàng trên vì trùng chức năng và không còn cần thiết.
- Hàng trên chỉ còn: Logo Siêu Di Động → ô tìm kiếm lớn → Tư vấn/Cửa hàng.
- Giữ `Danh mục sản phẩm` ở thanh menu dưới làm điểm mở danh mục duy nhất trên desktop.
- Ô tìm kiếm được mở rộng nên header cân và sạch hơn.
- Mobile vẫn dùng nút hamburger như hiện tại.

## V212 - AI trả kết quả bảo hành trực tiếp
- Sau khi AI hỏi SĐT, tin nhắn SĐT kế tiếp được bắt buộc chạy qua hệ thống tra cứu bảo hành.
- Không chuyển khách sang Zalo để kiểm tra bảo hành.
- Nếu tìm thấy: trả trực tiếp tên máy, ngày mua, hạn bảo hành và thời gian còn lại trong chat.
- Nếu không tìm thấy: báo trực tiếp không tìm thấy lịch sử mua hàng.
- Nếu API hệ thống tạm lỗi: báo thử lại sau, không đẩy khách sang Zalo.
- Sau khi trả kết quả, luồng bảo hành được đóng như V209.

## V213 - Bắt buộc SĐT bảo hành đi thẳng vào hệ thống
- Sửa tận route server, không còn phụ thuộc Gemini hiểu ngữ cảnh.
- Nếu AI vừa xin SĐT để tra cứu bảo hành và khách gửi một số điện thoại, request được chặn trước luồng AI chung.
- Server gọi trực tiếp `lookupWarrantyByPhone()` và trả kết quả vào chatbox.
- Gemini không được nhận tin nhắn SĐT này nên không thể tự nói `chưa tích hợp` hoặc đẩy khách sang Zalo.
- Sau khi trả kết quả, `warrantyPending=false` và `warrantyCompleted=true`.

## V214 - Giữ trạng thái tra cứu bảo hành từ frontend đến server
- Sửa trường hợp frontend gửi lịch sử bằng `sender: bot` thay vì `role: assistant`.
- Khi AI xin SĐT, frontend lưu `warrantyPending=true`.
- Tin nhắn SĐT kế tiếp gửi cờ này lên server và bị ép chạy thẳng `lookupWarrantyByPhone()`.
- Không cho AI chung trả các câu giả như `hệ thống đang kiểm tra`, `vui lòng chờ`, hoặc đẩy sang Zalo.
- Khi có kết quả thật, server trả `warrantyCompleted=true` và frontend xóa trạng thái chờ.

## V215 - Làm đẹp trang Tra cứu bảo hành
- Card chính gọn và cao cấp hơn với shadow nhẹ, bo góc đều.
- Khu tiêu đề cân lại icon, title và mô tả.
- Form tra cứu có nền xám nhạt, input và nút cam rõ hơn.
- Nút Tra cứu có chiều cao, bo góc và shadow cân đối.
- Chính sách bảo hành chuyển sang box cam nhạt có thanh nhấn bên trái.
- Mobile thu gọn khoảng cách và nút Tra cứu chuyển full-width.

## V216 - So sánh tối đa 2 máy
- Giới hạn chức năng so sánh chỉ 2 sản phẩm.
- Khi đã chọn đủ 2 máy, không cho thêm máy thứ 3.
- Thông báo đổi thành `Chỉ có thể so sánh 2 máy cùng lúc`.
- Thanh so sánh hiển thị `Đã chọn đủ 2 máy • Sẵn sàng so sánh`.
- Nút hành động đổi thành `So sánh 2 máy`.

## V217 - Viết hoa tên hãng
- Tất cả tên hãng trong bộ lọc thương hiệu được hiển thị IN HOA.
- Ví dụ: vivo → VIVO, Xiaomi → XIAOMI.
- Giữ nguyên `Tất cả` và `Bán chạy`.

## V218 - Thiết kế lại giao diện so sánh cho đúng 2 máy
- Modal thu gọn còn tối đa 1180px thay vì gần full màn hình.
- Cột tên thông số cố định 145px; hai cột sản phẩm chia đều không gian còn lại.
- Ảnh, tên, giá và tình trạng hàng của hai máy được trình bày như 2 card cân xứng.
- Gemini AI thu gọn thành thanh công cụ phía trên, giảm khoảng trống.
- Hàng thông số xen kẽ nền nhẹ, đường chia giữa 2 máy rõ hơn.
- Hover từng hàng giúp đối chiếu dễ hơn.
- Mobile vẫn giữ hai máy cạnh nhau và cho cuộn ngang bảng khi cần.

## V219 - So sánh mở thành trang riêng
- Bỏ hoàn toàn popup/modal so sánh.
- Khi chọn đủ 2 máy và bấm `So sánh 2 máy`, website chuyển sang `/so-sanh.html`.
- Trang so sánh có header riêng, nút quay lại chọn máy và bảng 2 cột cân đối.
- Gemini AI phân tích vẫn hoạt động trực tiếp trên trang so sánh.
- Dữ liệu 2 máy được lưu trong localStorage và trang riêng tự lấy thông số từ API.
- Mobile dùng trang riêng và cuộn ngang bảng khi cần, không còn cửa sổ nổi che giao diện.

## V220 - Fix trang so sánh mobile
- Bỏ min-width 700px khiến mobile chỉ thấy một máy.
- Hai máy luôn hiển thị cạnh nhau trong cùng màn hình.
- Cột tên thông số thu còn 92px, hai cột máy chia đều phần còn lại.
- Ảnh, tên máy, giá và trạng thái được thu gọn riêng cho mobile.
- Nội dung thông số tự xuống dòng, không làm tràn ngang trang.
- Khối Gemini AI chuyển thành bố cục dọc, nút và dropdown full-width.
- Header và tiêu đề trang cũng được thu gọn.

## V221 - Khôi phục nút nghe AI tư vấn
- Sau khi Gemini phân tích xong sẽ hiện `🔊 Nghe tư vấn`.
- Bấm để đọc toàn bộ kết luận bằng giọng tiếng Việt của thiết bị.
- Khi đang đọc, nút đổi thành `⏹ Dừng đọc`.
- Bấm lần nữa để dừng.
- Nút chỉ xuất hiện sau khi có kết quả AI thật, không chiếm chỗ trước đó.
- Desktop và mobile đều hỗ trợ.

## V222
- Chuyển nút `Nghe AI tư vấn` lên ngay dưới nút `Gemini phân tích`.
- Kết quả phân tích nằm phía dưới nút nghe.
- Nút nghe vẫn chỉ xuất hiện sau khi Gemini đã trả kết quả.

## V223 - Quản trị trả góp
- Thêm tab **Trả góp** trong trang quản trị.
- Mặc định có **HD SAISON** và **Mirae Asset**.
- Cho chỉnh tên công ty tài chính, URL logo, bật/tắt hiển thị.
- Mỗi công ty có thể thêm/xóa nhiều nhân viên tư vấn.
- Mỗi nhân viên có: tên, số Zalo và ghi chú.
- Dữ liệu được lưu Redis qua API quản trị có xác thực.
- Có public API `/api/installment-settings` để trang Trả góp đọc dữ liệu sau này.

## V224 - Kích hoạt Trả góp trên trang chính
- Sửa menu Trả góp desktop/mobile: mở popup thay vì trỏ về danh sách sản phẩm.
- Popup đọc trực tiếp cấu hình từ `/api/installment-settings`.
- Hiển thị HD SAISON, Mirae Asset, logo, trạng thái bật/tắt và danh sách nhân viên tư vấn từ trang quản trị.
- Nút Nhắn Zalo hỗ trợ cả số điện thoại và URL Zalo; tối ưu giao diện mobile.

## V225 - Trang trả góp riêng
- Menu Trả góp desktop/mobile chuyển sang `/tra-gop.html` thay vì popup.
- Có URL riêng để mở trực tiếp/chia sẻ.
- Trang trả góp tiếp tục lấy dữ liệu từ `/api/installment-settings` và phần quản trị hiện có.

## V226 - Đồng bộ nút Trang chủ
- Tăng nút Trang chủ trên trang Tra cứu bảo hành để bằng kích thước nút Trang chủ bên trang Trả góp trên mobile.


## V227 - Đảo vị trí header trang Trả góp
- Chuyển nút Trang chủ sang bên trái.
- Chuyển logo/thương hiệu Siêu Di Động sang bên phải.
- Giữ nguyên kích thước và giao diện hiện tại.

## V229 - Thu gọn khối AI/Zalo trên mobile
- Giảm chiều cao header AI, logo và nút đóng.
- Bỏ khung xanh lớn của khu vực hỗ trợ nhân viên.
- Đưa CTA Zalo thành hàng gọn liền mạch ngay dưới header.
- Nút Nhắn Zalo nền xanh, nhỏ gọn; giữ mô tả hỗ trợ trực tiếp.


## V232
- Dashboard quản trị tự giãn theo vùng nội dung, bỏ giới hạn 1480/1560px gây trống hai bên trên màn hình rộng.
- Desktop giữ lề 20–24px; tablet 12px; mobile 8px.

## V233 - Khu danh mục kiểu showroom
- Thiết kế lại khu vực danh mục/trình lọc trang chủ theo mẫu tham chiếu.
- Sidebar danh mục bên trái, lưới thương hiệu 5 cột, nhóm mức giá và dải lợi ích phía dưới.
- Tách OnePlus, Realme, iQOO, POCO thành hãng riêng để hiển thị đúng hơn.
- Mobile chuyển sidebar/brand/giá thành thanh cuộn ngang gọn.


## V234
- Xóa cột danh mục nhanh bên trái ở khu vực thương hiệu/giá trên trang chủ.
- Khu vực thương hiệu và mức giá sử dụng toàn bộ chiều rộng.

## V248 - Dashboard quản trị theo kỳ
- Thiết kế lại trang Tổng quan quản trị để dễ đọc hơn trên màn hình lớn.
- Thêm bộ lọc Hôm nay / 7 ngày / 30 ngày / Tháng này / Năm nay.
- KPI truy cập, khách, xem sản phẩm, so sánh, Zalo và tra bảo hành thay đổi theo kỳ đang chọn.
- Biểu đồ truy cập đổi theo ngày hoặc theo tháng; thêm bảng tổng hợp 6 tháng gần nhất.
- Dữ liệu thống kê ngày mới được giữ khoảng 400 ngày để hỗ trợ báo cáo năm.
- Gọn lại sidebar, bỏ mục AI/SEO bị lặp.


## V251 - Đăng nhập quản trị
- Giao diện đăng nhập mới, responsive.
- Hiện/ẩn mật khẩu.
- Có tùy chọn giữ đăng nhập 7 ngày; nếu bỏ chọn, cookie chỉ tồn tại trong phiên trình duyệt.
- Tự kiểm tra session khi mở trang; session còn hiệu lực thì vào thẳng dashboard.
- Giữ thông báo số lần thử còn lại từ API khi nhập sai.


## V252 - Danh sách Máy cũ
- Thêm mục `Máy cũ` trên menu desktop và menu mobile.
- Tự nhận diện sản phẩm máy cũ qua tên/danh mục: Máy cũ, Like New, 95%-99%, máy lướt, used, secondhand...
- Máy cũ được tách khỏi danh sách Điện thoại/Máy tính bảng mới để tránh lẫn hàng.
- Giữ nguyên lọc hãng, mức giá, tìm kiếm, so sánh và chi tiết sản phẩm.
- Hỗ trợ URL `?category=Máy+cũ`.


## V253 - Máy cũ quản lý riêng
- Không dùng KiotViet cho máy cũ.
- Mỗi chiếc quản lý riêng trong admin, có tối đa 8 ảnh thực tế, IMEI nội bộ, tình trạng, pin, bảo hành, phụ kiện, trạng thái Còn hàng/Đã bán.
- Máy Đã bán tự ẩn khỏi website nhưng giữ trong lịch sử quản trị.


## V254
- Sửa menu quản trị: thêm khu vực SẢN PHẨM > Danh sách máy cũ hiển thị rõ ràng ở sidebar.


## V256 - Fix lưu máy cũ
- Báo rõ khi thiếu ảnh/tên/giá; tự cuộn tới trường lỗi.
- Toast thành công/thất bại khi lưu.
- Nén ảnh nhỏ hơn để tránh vượt giới hạn request khi tải nhiều ảnh.


## V256 - Fix lưu Máy cũ
- Khôi phục JavaScript Lưu/Sửa/Xóa/Tải danh sách đã bị thiếu ở V255.
- Báo rõ khi thiếu ảnh, tên hoặc giá.
- Tự nén ảnh nhỏ hơn để tránh request quá lớn.


## V257 - Quản lý máy cũ tiện hơn
- Gợi ý hãng tự động theo tên máy.
- Gợi ý bộ nhớ, màu, ngoại hình, pin, bảo hành, phụ kiện.
- Nhớ tên các máy đã nhập để gợi ý khi nhập máy tương tự.
- Tìm nhanh danh sách theo tên máy/IMEI.
- Tối ưu bố cục nhập liệu và danh sách.


## V258
- Sửa lỗi thẻ máy cũ ngoài website hiển thị mã nội bộ `used:used_xxx` thay cho tên sản phẩm.
- Ưu tiên hiển thị trường `name` của máy cũ; mã nội bộ chỉ dùng để định danh hệ thống.


## V259 - Fix tên máy cũ tại nguồn
- Sửa `groupItems`: key `used:used_xxx` chỉ dùng nội bộ để gom nhóm.
- `group.name` của máy cũ lấy trực tiếp tên máy đã nhập trong quản trị.
- Tên đúng được dùng đồng nhất ở card, trang chi tiết, so sánh và URL sản phẩm.


## V260 - Ảnh máy cũ lưu Cloudinary

Từ V260, ảnh máy cũ mới không còn lưu Base64 trong Redis.

### Cấu hình trên Vercel
Vào Project > Settings > Environment Variables và thêm:

- `CLOUDINARY_CLOUD_NAME` = Cloud name trong Cloudinary
- `CLOUDINARY_API_KEY` = API Key
- `CLOUDINARY_API_SECRET` = API Secret
- `CLOUDINARY_USED_FOLDER` = `sieu-di-dong/may-cu` (không bắt buộc)

Sau khi thêm biến môi trường, redeploy website.

### Cách lưu
- Ảnh thực tế: upload trực tiếp từ trình duyệt lên Cloudinary bằng signed upload.
- Redis: chỉ lưu URL ảnh + `public_id`.
- Khi bỏ một ảnh trong lúc sửa máy: ảnh Cloudinary cũ sẽ được xóa khi bấm Lưu thay đổi.
- Khi xóa máy cũ: toàn bộ ảnh Cloudinary có `public_id` của máy đó sẽ được dọn.
- Dữ liệu máy cũ cũ đã lưu Base64 trước V260 vẫn đọc được để tránh mất dữ liệu.


## V261 - Trang chi tiết cân đối desktop
- Tăng chiều rộng trang chi tiết theo màn hình, tối đa khoảng 1580px.
- Cân lại 3 cột: ảnh / thông tin / sản phẩm tương tự.
- Tăng ảnh, tiêu đề, CTA và thông số kỹ thuật trên desktop.
- Laptop 1100-1350px có layout co riêng; mobile giữ nguyên.


## V262 - Fix thống kê Hôm nay
- Sửa lỗi page_view chờ `navigator.userAgentData.getHighEntropyValues()` khiến một số trình duyệt chỉ gửi heartbeat nhưng không ghi lượt truy cập trong ngày.
- Page view giờ được gửi ngay bằng User-Agent fallback.
- Thông tin model/HĐH chi tiết được gửi riêng bằng `device_enrich`, không cộng trùng lượt xem.
- Giữ mốc ngày theo UTC+7 (Việt Nam).


## V263 - Sửa menu quản trị trên mobile
- Thêm nút hamburger cố định góc trên trái.
- Sidebar desktop trở thành drawer trượt từ trái trên mobile.
- Có lớp nền tối; bấm ngoài menu để đóng.
- Chọn một mục trong menu sẽ tự đóng drawer.
- Giữ nguyên thanh điều hướng nhanh phía dưới.


## V264 - Fix chữ menu quản trị mobile
- Khắc phục CSS <=1020px ẩn toàn bộ nhãn sidebar.
- Drawer mobile hiển thị đầy đủ tên shop, tiêu đề nhóm và tên từng chức năng.
- Khôi phục badge Mới/Riêng và trạng thái hệ thống.
- Giữ menu dạng drawer + overlay của V263.


## V265 - Sửa logo khi chia sẻ link
- Dùng ảnh riêng `/assets/share-logo-v265.jpg` cho Facebook/Zalo.
- Ảnh vuông 1254x1254, tránh bị cắt mất logo.
- Thêm đầy đủ Open Graph image metadata và Twitter image.
- Đổi URL ảnh mới để phá cache preview cũ.
- Không để logo cấu hình trong admin ghi đè ảnh chia sẻ.


## V266 - Fix drawer quản trị mobile
- Ẩn tuyệt đối các routing tab AI/SEO/Máy cũ, không còn chồng chữ dọc.
- Căn lại logo và nút đóng drawer.
- Không để bottom navigation gây nhiễu khi drawer đang mở.
- Giữ nguyên các mục menu thật và badge Mới/Riêng.


## V267 - Drawer mobile mặc định đóng
- Sửa lỗi vào trang quản trị mobile drawer tự mở che nội dung.
- Sidebar mobile mặc định translate ra ngoài màn hình.
- Chỉ class `mobile-open` mới cho phép hiện drawer.
- Tự reset drawer khi load/reload/back-forward cache.
- Nút hamburger mặc định nằm lại góc trái.


## V268 - Sửa thống kê chính xác
- Hôm nay/Hôm qua đọc trực tiếp từ Redis, không phụ thuộc truy vấn lịch sử 365 ngày.
- MGET lịch sử chia lô nhỏ 80 key và timeout 8 giây thay vì 2.5 giây.
- `Khách truy cập` = unique visitor (HyperLogLog).
- `Lượt truy cập` = số page load thực tế (`raw_pageviews`).
- Heartbeat cũng bảo đảm visitor đang online được ghi vào unique visitor hôm nay.
- Dashboard trả thêm `analyticsDay` và `timezone=Asia/Ho_Chi_Minh` để chẩn đoán.


## V269 - Thiết kế lại màn hình load quản trị
- Bỏ loader chữ bị lặp phía trên.
- Loader full-screen riêng, không hiện sidebar/topbar khi đang xác thực.
- Có logo Siêu Di Động, spinner, progress bar và 3 bước Xác thực → Tải dữ liệu → Hoàn tất.
- Trạng thái thay đổi theo tiến trình thực tế của `loadAdmin()`.
- Tối ưu riêng cho mobile.


## V270 - Thống kê V3 chống lỗi online có số nhưng khách = 0
- Tạo HyperLogLog visitor key V3 mới, không dùng key visitor cũ có nguy cơ sai kiểu Redis.
- Heartbeat ghi visitor V3 và tự phục hồi ít nhất 1 lượt truy cập/ngày nếu page_view bị mất.
- Admin lấy danh sách visitor online và nhập trực tiếp vào visitor V3 hôm nay trước khi tính số.
- Vì online ZSET dùng visitor ID duy nhất, Khách truy cập hôm nay tối thiểu bằng số visitor đang online sau lần làm mới.


## V271 - Fix thứ tự thống kê Online → Khách truy cập
- Sửa race condition của V270: PFCOUNT Hôm nay từng chạy đồng thời với PFADD visitor online.
- V271 lấy danh sách online trước, reconcile Redis xong rồi mới đọc số Hôm nay.
- Visitor đang online được ghi vào `analytics:v3:visitors:day:*`.
- Visitor online chưa có page view được bổ sung tối thiểu 1 lượt truy cập/ngày, không cộng trùng nhờ SADD.
- Có invariant: nếu Online > 0 thì Khách truy cập/Lượt truy cập hôm nay không thể hiển thị 0.


## V272 - Chặn mâu thuẫn Online > 0 nhưng Hôm nay = 0
- Dashboard dùng `onlineNow` làm lower-bound hợp lệ cho Khách truy cập và Lượt truy cập Hôm nay.
- Nếu online = 5 nhưng API period hôm nay trả 0, giao diện hiển thị tối thiểu 5.
- Đồng bộ cả lần render đầu tiên, period Hôm nay và cột ngày hiện tại trên biểu đồ.
- API trả thêm `analyticsVersion: v272`; request admin có `client=v272` để dễ xác minh deployment.


## V273 - Fix DOM cuối cho thống kê
- Theo dõi trực tiếp 3 ô: Đang online, Khách truy cập, Lượt truy cập.
- Khi tab Hôm nay đang chọn và Online > 0, Khách/Lượt truy cập không thể thấp hơn Online.
- MutationObserver chạy sau mọi render nên không bị hàm khác ghi đè lại về 0.
- Có kiểm tra định kỳ 1 giây và gọi lại sau `applyAnalyticsPeriod`.
- Tooltip tiêu đề Tổng quan có `Admin V273` để kiểm tra đúng bản deploy.


## V274 - Thiết kế lại dashboard quản trị desktop
- Giới hạn chiều rộng nội dung để dashboard không bị kéo quá ngang trên màn hình lớn.
- Card số liệu 4 cột, card bảo hành 3 cột.
- Biểu đồ chia tỷ lệ 2:1, dễ đọc hơn.
- Tăng khoảng trắng, cỡ chữ, bo góc và hierarchy.
- Các bảng thiết bị / sản phẩm / từ khóa / so sánh được bố trí lại theo lưới 12 cột.
- Laptop 1024–1280 có breakpoint riêng.
- Mobile giữ nguyên layout hiện tại.


## V275 - Thiết kế lại tra cứu bảo hành
- Cân lại tỷ lệ tiêu đề / form tra cứu.
- Giảm phần trống, form gọn hơn và dễ nhìn hơn.
- Kết quả sản phẩm rộng toàn khung.
- 4 ô Ngày mua / Bảo hành đến / Hóa đơn / Thời gian còn lại cân đều.
- Trạng thái bảo hành, IMEI và hỗ trợ đổi máy rõ hơn.
- Mobile giữ nguyên.


## V276 - Khách truy cập hôm nay tích lũy đúng
- Bỏ HyperLogLog làm nguồn chính cho số Khách truy cập theo ngày.
- Mỗi ngày dùng Redis SET `analytics:v4:visitors:day:YYYY-MM-DD`.
- `page_view` và `heartbeat` đều SADD visitor vào SET của ngày.
- Visitor offline chỉ bị loại khỏi `analytics:online`; KHÔNG bị xóa khỏi SET Khách truy cập hôm nay.
- Dashboard dùng SCARD nên số hôm nay chỉ tăng hoặc giữ nguyên trong ngày.
- 7 ngày / 30 ngày / tháng / năm dùng hợp nhất visitor ID từ các SET ngày để không đếm trùng.
- Bỏ các bản vá UI kiểu Online làm lower-bound vì không còn đúng bản chất.


## V278 - Làm lại hệ thống thống kê V5

Bỏ cơ chế thống kê cũ làm nguồn chính. V5 dùng cấu trúc đơn giản:

- `analytics:v5:visitors:YYYY-MM-DD` — ZSET visitor duy nhất trong ngày.
- `analytics:v5:day:YYYY-MM-DD` — HASH chứa pageviews, xem chi tiết, so sánh, Zalo, bảo hành...
- `analytics:online` — ZSET riêng, chỉ dùng cho số đang online trong 5 phút.
- `analytics:v5:visit_seen:YYYY-MM-DD` — đảm bảo heartbeat chỉ bổ sung 1 lượt/ngày nếu page_view bị mất.

Quy tắc:
- Khách truy cập hôm nay = ZCARD visitor ZSET của ngày, chỉ tăng/giữ nguyên.
- Online giảm khi khách rời web nhưng không làm giảm Khách truy cập hôm nay.
- Lượt truy cập = số page_view thực tế.
- Khi admin load, visitor đang online được migrate vào ZSET hôm nay trước khi dashboard đọc số.
- 7/30 ngày/tháng/năm dùng ZUNIONSTORE key tạm TTL 30 giây để union visitor chính xác, không đếm trùng.


## V278 - Thiết kế lại trang Trả góp
- Hero gọn, điều kiện chính hiển thị bằng 3 thẻ: Từ 18 tuổi / Trả trước 0đ / Duyệt trước.
- Hai công ty tài chính hiển thị 2 cột trên desktop, 1 cột trên mobile.
- Nhân viên tư vấn thành card riêng, nút Zalo rõ ràng.
- Nội dung lưu ý ngắn và dễ đọc hơn.
- Giữ nguyên dữ liệu cấu hình trả góp từ quản trị.


## V280 Dashboard redesign
- Giao diện dashboard mới compact, dễ đọc, giảm khoảng trắng.
- KPI, biểu đồ và các bảng được chia lại theo mức độ quan trọng.


## V281 - Dashboard lớn và dễ đọc hơn
- Tăng chiều rộng dashboard lên tối đa 1580–1660px.
- KPI cao hơn, số lớn hơn 10–15%.
- Tăng font tiêu đề, bộ lọc thời gian và bảng dữ liệu.
- Biểu đồ cao hơn, các card dưới rộng và thoáng hơn.
- Mobile cũng tăng nhẹ kích thước chữ/số.


## V284 - Dashboard chuyên nghiệp theo ảnh demo
- Sidebar sáng, hiện đại, giao diện kiểu hệ thống quản trị chuyên nghiệp.
- Header/topbar gọn và tách rõ vùng thao tác.
- KPI card có màu nhận diện riêng, hierarchy rõ ràng.
- Biểu đồ / tháng / thiết bị chia bố cục 6-3-3.
- Các bảng bên dưới bố trí card đồng đều, giảm cảm giác rối.
- Giữ nguyên toàn bộ logic và số liệu backend hiện tại.


## V285 - Biểu đồ dashboard giống ảnh demo
- Thay biểu đồ cột cũ bằng SVG line chart 2 series: Lượt truy cập + Khách truy cập.
- Có grid, trục ngày, gradient area, point hover và tooltip.
- Thiết bị truy cập chuyển thành donut chart + legend.
- Tổng hợp tháng được polish thành progress bars.
- Không dùng dữ liệu giả; biểu đồ đọc trực tiếp `daily`, `devices`, `monthly` từ API thống kê.


## V291 - Dashboard compact giống ảnh demo
- Bảng khách tra cứu bảo hành đặt ngay sau 3 KPI bảo hành.
- Bỏ Xu hướng truy cập.
- 6 card dưới cùng chia đều 6 cột trên màn hình rộng.
- Tổng hợp tháng, donut thiết bị, sản phẩm, điện thoại, từ khóa, hệ điều hành đều thu gọn.
- Desktop bỏ sidebar, mobile giữ menu hiện tại.


## V292 - Fix dashboard bị cắt mất nội dung
- Bỏ height/max-height cố định của vùng thống kê.
- Bỏ scrollbar nội bộ của dashboard.
- Toàn bộ card phía dưới hiển thị liên tục theo chiều dài trang.
- Chỉ bảng lịch sử tra cứu bảo hành giữ scroll riêng vì danh sách dài.


## V311 - Fix thống kê Lượt so sánh và Bấm Zalo
- Frontend đang gửi `compare_create`, backend trước đây chỉ nhận `compare`.
- Frontend đang gửi `zalo_click`, backend trước đây chỉ nhận `zalo`.
- API analytics giờ chấp nhận cả tên event cũ và mới.
- Lượt so sánh và Bấm Zalo sẽ cộng vào thống kê theo ngày và tổng hệ thống.


## V313 - Tên khách hàng trong lịch sử tra bảo hành
- Lấy tên khách hàng trực tiếp từ API khách hàng KiotViet theo số điện thoại.
- API tra bảo hành trả thêm `customerName`.
- Lịch sử Redis `analytics:warranty_recent` lưu thêm `customerName`.
- Admin thêm cột `Tên khách hàng`.
- Bản ghi cũ chưa lưu tên sẽ hiển thị `—`; lượt tra cứu mới sẽ có tên nếu KiotViet trả về.


## V317 - Ổn định trang chi tiết sản phẩm
- Quay về cấu trúc DOM gốc của V315.
- Không còn JavaScript tự bọc / di chuyển gallery ảnh.
- Không thay đổi logic ảnh, màu, dung lượng, mua hàng, so sánh.
- Chỉ dùng CSS để tăng kích thước, bo card, font và bảng thông số.
- Tránh lỗi ảnh chính bị thu nhỏ hoặc biến mất khi app.js render lại sản phẩm.
