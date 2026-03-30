// ── Curated Emoji Sticker Packs (iPhone-inspired) ──

export interface StickerItem {
    emoji: string;
    label: string;
}

export interface StickerPack {
    id: string;
    name: string;
    icon: string;
    stickers: StickerItem[];
}

export const STICKER_PACKS: StickerPack[] = [
    {
        id: 'smileys',
        name: 'Mặt cười',
        icon: '😀',
        stickers: [
            { emoji: '😀', label: 'Cười' }, { emoji: '😃', label: 'Cười lớn' }, { emoji: '😄', label: 'Cười vui' },
            { emoji: '😆', label: 'Cười nghiêng' }, { emoji: '😂', label: 'Cười ra nước mắt' }, { emoji: '🤣', label: 'Lăn cười' },
            { emoji: '😊', label: 'Hạnh phúc' }, { emoji: '😇', label: 'Thiên thần' }, { emoji: '🙂', label: 'Nhẹ nhàng' },
            { emoji: '😉', label: 'Nháy mắt' }, { emoji: '😍', label: 'Mắt trái tim' }, { emoji: '🥰', label: 'Yêu thương' },
            { emoji: '😘', label: 'Hôn' }, { emoji: '😋', label: 'Ngon' }, { emoji: '😜', label: 'Lè lưỡi' },
            { emoji: '🤪', label: 'Điên' }, { emoji: '😎', label: 'Cool' }, { emoji: '🤩', label: 'Sao mắt' },
            { emoji: '🥹', label: 'Cảm động' }, { emoji: '😢', label: 'Khóc' }, { emoji: '😭', label: 'Khóc lớn' },
            { emoji: '😤', label: 'Tức giận' }, { emoji: '😡', label: 'Giận dữ' }, { emoji: '🤯', label: 'Nổ não' },
            { emoji: '😱', label: 'Hoảng sợ' }, { emoji: '😴', label: 'Ngủ' }, { emoji: '🤔', label: 'Suy nghĩ' },
            { emoji: '🫠', label: 'Tan chảy' }, { emoji: '😏', label: 'Ranh mãnh' }, { emoji: '🤗', label: 'Ôm' },
            { emoji: '🤭', label: 'Che miệng' }, { emoji: '🤫', label: 'Suỵt' }, { emoji: '🫣', label: 'Nhìn lén' },
            { emoji: '😬', label: 'Ngại' }, { emoji: '🙄', label: 'Chán' }, { emoji: '😮‍💨', label: 'Thở dài' },
            { emoji: '🥺', label: 'Van xin' }, { emoji: '😈', label: 'Quỷ cười' }, { emoji: '👻', label: 'Ma' },
            { emoji: '💀', label: 'Chết cười' }, { emoji: '🤡', label: 'Hề' }, { emoji: '💩', label: 'Poop' },
            { emoji: '🫡', label: 'Chào' }, { emoji: '🫢', label: 'Ngạc nhiên' }, { emoji: '🤤', label: 'Chảy dãi' },
        ],
    },
    {
        id: 'gestures',
        name: 'Cử chỉ',
        icon: '👋',
        stickers: [
            { emoji: '👋', label: 'Vẫy tay' }, { emoji: '🤚', label: 'Giơ tay' }, { emoji: '✋', label: 'Dừng' },
            { emoji: '🖖', label: 'Vulcan' }, { emoji: '✌️', label: 'Hoà bình' }, { emoji: '🤞', label: 'Hy vọng' },
            { emoji: '🫰', label: 'Love you' }, { emoji: '🤟', label: 'ILY' }, { emoji: '🤘', label: 'Rock' },
            { emoji: '🤙', label: 'Gọi điện' }, { emoji: '👍', label: 'Like' }, { emoji: '👎', label: 'Dislike' },
            { emoji: '👊', label: 'Đấm' }, { emoji: '✊', label: 'Nắm đấm' }, { emoji: '🤛', label: 'Đấm trái' },
            { emoji: '🤜', label: 'Đấm phải' }, { emoji: '👏', label: 'Vỗ tay' }, { emoji: '🙌', label: 'Giơ 2 tay' },
            { emoji: '🫶', label: 'Trái tim tay' }, { emoji: '🤝', label: 'Bắt tay' }, { emoji: '🙏', label: 'Cầu nguyện' },
            { emoji: '💪', label: 'Cơ bắp' }, { emoji: '🤌', label: 'Pinch' }, { emoji: '👈', label: 'Trỏ trái' },
            { emoji: '👉', label: 'Trỏ phải' }, { emoji: '👆', label: 'Trỏ lên' }, { emoji: '👇', label: 'Trỏ xuống' },
            { emoji: '☝️', label: 'Số 1' }, { emoji: '🫵', label: 'Trỏ bạn' }, { emoji: '✍️', label: 'Viết' },
            { emoji: '🤳', label: 'Selfie' }, { emoji: '💅', label: 'Sơn móng' }, { emoji: '🦾', label: 'Tay robot' },
            { emoji: '🖐️', label: 'Xoè tay' }, { emoji: '🤲', label: 'Đón nhận' }, { emoji: '👐', label: 'Mở rộng' },
        ],
    },
    {
        id: 'hearts',
        name: 'Trái tim',
        icon: '❤️',
        stickers: [
            { emoji: '❤️', label: 'Trái tim đỏ' }, { emoji: '🧡', label: 'Cam' }, { emoji: '💛', label: 'Vàng' },
            { emoji: '💚', label: 'Xanh lá' }, { emoji: '💙', label: 'Xanh dương' }, { emoji: '💜', label: 'Tím' },
            { emoji: '🤎', label: 'Nâu' }, { emoji: '🖤', label: 'Đen' }, { emoji: '🤍', label: 'Trắng' },
            { emoji: '💕', label: 'Hai tim' }, { emoji: '💞', label: 'Tim quay' }, { emoji: '💓', label: 'Tim đập' },
            { emoji: '💗', label: 'Tim lớn' }, { emoji: '💖', label: 'Tim sáng' }, { emoji: '💝', label: 'Tim nơ' },
            { emoji: '💘', label: 'Mũi tên tim' }, { emoji: '💟', label: 'Tim trang trí' }, { emoji: '❤️‍🔥', label: 'Tim lửa' },
            { emoji: '❤️‍🩹', label: 'Tim lành' }, { emoji: '💔', label: 'Tim vỡ' }, { emoji: '🫀', label: 'Tim thật' },
            { emoji: '💋', label: 'Nụ hôn' }, { emoji: '💌', label: 'Thư tình' }, { emoji: '💐', label: 'Bó hoa' },
            { emoji: '🌹', label: 'Hoa hồng' }, { emoji: '🥀', label: 'Hoa héo' }, { emoji: '💍', label: 'Nhẫn' },
            { emoji: '🫂', label: 'Ôm nhau' }, { emoji: '👩‍❤️‍👨', label: 'Cặp đôi' }, { emoji: '💑', label: 'Yêu nhau' },
        ],
    },
    {
        id: 'celebration',
        name: 'Lễ hội',
        icon: '🎉',
        stickers: [
            { emoji: '🎉', label: 'Party popper' }, { emoji: '🎊', label: 'Confetti' }, { emoji: '🥳', label: 'Party' },
            { emoji: '🎂', label: 'Sinh nhật' }, { emoji: '🎁', label: 'Quà' }, { emoji: '🎀', label: 'Nơ' },
            { emoji: '🎈', label: 'Bóng bay' }, { emoji: '🎆', label: 'Pháo hoa' }, { emoji: '🎇', label: 'Bông hoa lửa' },
            { emoji: '✨', label: 'Lấp lánh' }, { emoji: '🌟', label: 'Ngôi sao' }, { emoji: '⭐', label: 'Sao vàng' },
            { emoji: '🏆', label: 'Cúp vàng' }, { emoji: '🥇', label: 'Huy chương vàng' }, { emoji: '🥈', label: 'Bạc' },
            { emoji: '🥉', label: 'Đồng' }, { emoji: '🏅', label: 'Huy chương' }, { emoji: '🎖️', label: 'Huân chương' },
            { emoji: '🎯', label: 'Chính xác' }, { emoji: '🎪', label: 'Xiếc' }, { emoji: '🎭', label: 'Kịch' },
            { emoji: '🎵', label: 'Nốt nhạc' }, { emoji: '🎶', label: 'Nhạc' }, { emoji: '🪩', label: 'Disco' },
            { emoji: '🥂', label: 'Chúc mừng' }, { emoji: '🍾', label: 'Champagne' }, { emoji: '🎺', label: 'Kèn' },
            { emoji: '🥁', label: 'Trống' }, { emoji: '👑', label: 'Vương miện' }, { emoji: '💎', label: 'Kim cương' },
        ],
    },
    {
        id: 'animals',
        name: 'Động vật',
        icon: '😺',
        stickers: [
            { emoji: '😺', label: 'Mèo cười' }, { emoji: '😸', label: 'Mèo vui' }, { emoji: '😹', label: 'Mèo khóc cười' },
            { emoji: '😻', label: 'Mèo yêu' }, { emoji: '🙀', label: 'Mèo sợ' }, { emoji: '😿', label: 'Mèo buồn' },
            { emoji: '😾', label: 'Mèo giận' }, { emoji: '🐱', label: 'Mèo' }, { emoji: '🐶', label: 'Chó' },
            { emoji: '🐭', label: 'Chuột' }, { emoji: '🐹', label: 'Hamster' }, { emoji: '🐰', label: 'Thỏ' },
            { emoji: '🦊', label: 'Cáo' }, { emoji: '🐻', label: 'Gấu' }, { emoji: '🐼', label: 'Gấu trúc' },
            { emoji: '🐨', label: 'Koala' }, { emoji: '🐯', label: 'Hổ' }, { emoji: '🦁', label: 'Sư tử' },
            { emoji: '🐮', label: 'Bò' }, { emoji: '🐷', label: 'Heo' }, { emoji: '🐸', label: 'Ếch' },
            { emoji: '🐵', label: 'Khỉ' }, { emoji: '🐔', label: 'Gà' }, { emoji: '🐧', label: 'Chim cánh cụt' },
            { emoji: '🐦', label: 'Chim' }, { emoji: '🦋', label: 'Bướm' }, { emoji: '🐝', label: 'Ong' },
            { emoji: '🐠', label: 'Cá' }, { emoji: '🐬', label: 'Cá heo' }, { emoji: '🦄', label: 'Kỳ lân' },
            { emoji: '🐻‍❄️', label: 'Gấu Bắc Cực' }, { emoji: '🐲', label: 'Rồng' }, { emoji: '🦖', label: 'Khủng long' },
            { emoji: '🦩', label: 'Hồng hạc' }, { emoji: '🦜', label: 'Vẹt' }, { emoji: '🐾', label: 'Dấu chân' },
        ],
    },
    {
        id: 'food',
        name: 'Đồ ăn',
        icon: '🍔',
        stickers: [
            { emoji: '🍔', label: 'Hamburger' }, { emoji: '🍕', label: 'Pizza' }, { emoji: '🍟', label: 'Khoai tây' },
            { emoji: '🌮', label: 'Taco' }, { emoji: '🌯', label: 'Burrito' }, { emoji: '🍣', label: 'Sushi' },
            { emoji: '🍜', label: 'Phở' }, { emoji: '🍝', label: 'Mì Ý' }, { emoji: '🍛', label: 'Cà ri' },
            { emoji: '🍩', label: 'Donut' }, { emoji: '🍰', label: 'Bánh' }, { emoji: '🧁', label: 'Cupcake' },
            { emoji: '🍦', label: 'Kem' }, { emoji: '🍫', label: 'Sô cô la' }, { emoji: '🍪', label: 'Cookie' },
            { emoji: '🍿', label: 'Bỏng ngô' }, { emoji: '🧋', label: 'Trà sữa' }, { emoji: '☕', label: 'Cà phê' },
            { emoji: '🍺', label: 'Bia' }, { emoji: '🍷', label: 'Rượu' }, { emoji: '🥤', label: 'Nước ngọt' },
            { emoji: '🍎', label: 'Táo' }, { emoji: '🍓', label: 'Dâu' }, { emoji: '🍑', label: 'Đào' },
            { emoji: '🍉', label: 'Dưa hấu' }, { emoji: '🥑', label: 'Bơ' }, { emoji: '🌽', label: 'Ngô' },
            { emoji: '🍗', label: 'Đùi gà' }, { emoji: '🥩', label: 'Thịt bò' }, { emoji: '🧇', label: 'Waffle' },
            { emoji: '🥐', label: 'Croissant' }, { emoji: '🥚', label: 'Trứng' }, { emoji: '🍳', label: 'Ốp la' },
            { emoji: '🫕', label: 'Lẩu' }, { emoji: '🥟', label: 'Há cảo' }, { emoji: '🍙', label: 'Cơm nắm' },
        ],
    },
    {
        id: 'activities',
        name: 'Hoạt động',
        icon: '⚽',
        stickers: [
            { emoji: '⚽', label: 'Bóng đá' }, { emoji: '🏀', label: 'Bóng rổ' }, { emoji: '🎮', label: 'Game' },
            { emoji: '🎯', label: 'Phi tiêu' }, { emoji: '🎲', label: 'Xúc xắc' }, { emoji: '🎸', label: 'Guitar' },
            { emoji: '🎹', label: 'Piano' }, { emoji: '🎤', label: 'Micro' }, { emoji: '🎧', label: 'Tai nghe' },
            { emoji: '📷', label: 'Máy ảnh' }, { emoji: '🎬', label: 'Phim' }, { emoji: '🎨', label: 'Vẽ' },
            { emoji: '🏊', label: 'Bơi' }, { emoji: '🚴', label: 'Đạp xe' }, { emoji: '🧘', label: 'Yoga' },
            { emoji: '🏃', label: 'Chạy' }, { emoji: '💃', label: 'Nhảy nữ' }, { emoji: '🕺', label: 'Nhảy nam' },
            { emoji: '🎣', label: 'Câu cá' }, { emoji: '🏄', label: 'Lướt sóng' }, { emoji: '⛷️', label: 'Trượt tuyết' },
            { emoji: '🚀', label: 'Tên lửa' }, { emoji: '✈️', label: 'Máy bay' }, { emoji: '🚗', label: 'Xe hơi' },
            { emoji: '🏠', label: 'Nhà' }, { emoji: '🏖️', label: 'Bãi biển' }, { emoji: '🏕️', label: 'Cắm trại' },
            { emoji: '📱', label: 'Điện thoại' }, { emoji: '💻', label: 'Laptop' }, { emoji: '🖥️', label: 'Máy tính' },
            { emoji: '🎪', label: 'Xiếc' }, { emoji: '🛹', label: 'Ván trượt' }, { emoji: '🏋️', label: 'Tạ' },
            { emoji: '🤸', label: 'Nhào lộn' }, { emoji: '🧗', label: 'Leo núi' }, { emoji: '🎳', label: 'Bowling' },
        ],
    },
    {
        id: 'nature',
        name: 'Thiên nhiên',
        icon: '🌈',
        stickers: [
            { emoji: '🌈', label: 'Cầu vồng' }, { emoji: '☀️', label: 'Mặt trời' }, { emoji: '🌤️', label: 'Nắng mây' },
            { emoji: '⛅', label: 'Mây' }, { emoji: '🌙', label: 'Trăng' }, { emoji: '🌛', label: 'Trăng cười' },
            { emoji: '⭐', label: 'Sao' }, { emoji: '🌸', label: 'Hoa đào' }, { emoji: '🌺', label: 'Hoa dâm bụt' },
            { emoji: '🌻', label: 'Hoa hướng dương' }, { emoji: '🌷', label: 'Hoa tulip' }, { emoji: '🌼', label: 'Hoa cúc' },
            { emoji: '🍀', label: 'Cỏ 4 lá' }, { emoji: '🌿', label: 'Lá xanh' }, { emoji: '🍃', label: 'Lá bay' },
            { emoji: '🍁', label: 'Lá phong' }, { emoji: '🍂', label: 'Lá rụng' }, { emoji: '🌊', label: 'Sóng' },
            { emoji: '🔥', label: 'Lửa' }, { emoji: '❄️', label: 'Tuyết' }, { emoji: '☃️', label: 'Người tuyết' },
            { emoji: '🌪️', label: 'Lốc xoáy' }, { emoji: '⚡', label: 'Sét' }, { emoji: '💧', label: 'Nước' },
            { emoji: '🌍', label: 'Trái đất' }, { emoji: '🌕', label: 'Trăng tròn' }, { emoji: '🌑', label: 'Trăng mới' },
            { emoji: '🪐', label: 'Hành tinh' }, { emoji: '🌋', label: 'Núi lửa' }, { emoji: '🏔️', label: 'Núi tuyết' },
            { emoji: '🌲', label: 'Cây thông' }, { emoji: '🌴', label: 'Cây dừa' }, { emoji: '🌵', label: 'Xương rồng' },
            { emoji: '🍄', label: 'Nấm' }, { emoji: '🐚', label: 'Vỏ sò' }, { emoji: '💐', label: 'Bó hoa' },
        ],
    },
];

/** Search stickers across all packs by label or emoji */
export function searchStickers(query: string): StickerItem[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const results: StickerItem[] = [];
    for (const pack of STICKER_PACKS) {
        for (const s of pack.stickers) {
            if (s.label.toLowerCase().includes(q) || s.emoji.includes(q)) {
                results.push(s);
            }
        }
    }
    return results;
}
