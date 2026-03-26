import StaticPageLayout from '../components/layout/StaticPageLayout';

export default function PrivacyPage() {
    return (
        <StaticPageLayout title="Chính sách bảo mật" description="Chính sách bảo mật dữ liệu của NemarkChat.">
            <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8 }}>Chính sách bảo mật</h1>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: 40, fontSize: 14 }}>Cập nhật lần cuối: 22/03/2026</p>

            {[
                { title: '1. Thông tin chúng tôi thu thập', content: 'Chúng tôi thu thập thông tin cá nhân bao gồm: họ tên, email, số điện thoại khi bạn đăng ký tài khoản. Ngoài ra, chúng tôi thu thập dữ liệu sử dụng hệ thống như tin nhắn, hội thoại, và nhật ký hoạt động nhằm cải thiện dịch vụ.' },
                { title: '2. Mục đích sử dụng', content: 'Thông tin được sử dụng để: cung cấp và duy trì dịch vụ, cải thiện trải nghiệm người dùng, gửi thông báo về sản phẩm và cập nhật, đảm bảo bảo mật tài khoản, và tuân thủ các yêu cầu pháp lý.' },
                { title: '3. Chia sẻ thông tin', content: 'Chúng tôi cam kết không bán, cho thuê hoặc chia sẻ thông tin cá nhân với bên thứ ba, ngoại trừ các trường hợp: được sự đồng ý của bạn, yêu cầu pháp lý, hoặc cung cấp cho đối tác xử lý dữ liệu đã ký thỏa thuận bảo mật.' },
                { title: '4. Bảo mật dữ liệu', content: 'Chúng tôi áp dụng các biện pháp bảo mật kỹ thuật và tổ chức bao gồm: mã hoá dữ liệu, kiểm soát truy cập, audit log, và sao lưu định kỳ để bảo vệ dữ liệu của bạn.' },
                { title: '5. Lưu trữ và xoá dữ liệu', content: 'Dữ liệu được lưu trữ trên máy chủ đảm bảo an toàn. Bạn có quyền yêu cầu xoá tài khoản và dữ liệu cá nhân bất kỳ lúc nào thông qua trang cài đặt hoặc liên hệ support.' },
                { title: '6. Cookie', content: 'Chúng tôi sử dụng cookie để duy trì phiên đăng nhập và cải thiện trải nghiệm sử dụng. Bạn có thể tắt cookie trong cài đặt trình duyệt, tuy nhiên một số tính năng có thể bị ảnh hưởng.' },
                { title: '7. Quyền của người dùng', content: 'Bạn có quyền: truy cập, chỉnh sửa, xoá dữ liệu cá nhân; yêu cầu xuất dữ liệu (DSAR); thu hồi đồng ý xử lý dữ liệu; và khiếu nại với cơ quan bảo vệ dữ liệu.' },
                { title: '8. Liên hệ', content: 'Nếu bạn có bất kỳ câu hỏi nào về chính sách bảo mật, vui lòng liên hệ qua email: privacy@nemarkchat.com' },
            ].map((section) => (
                <section key={section.title} style={{ marginBottom: 32 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{section.title}</h2>
                    <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.8, fontSize: 15 }}>{section.content}</p>
                </section>
            ))}
        </StaticPageLayout>
    );
}
