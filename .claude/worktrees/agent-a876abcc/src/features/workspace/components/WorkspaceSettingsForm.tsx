import React, { useEffect, useState } from 'react';
import { Form, Input, Button, Upload, message, Avatar, Select, Spin, Divider, Tag, Space, Tooltip, Typography } from 'antd';
const { Text } = Typography;
import { UploadOutlined, BuildOutlined, PlusOutlined } from '@ant-design/icons';
import { useWorkspace, useUpdateWorkspace, useWorkspaceTags, useAddWorkspaceTag, useRemoveWorkspaceTag } from '../../../domains/workspace/workspace.hooks';

export default function WorkspaceSettingsForm({ workspaceId }: { workspaceId: string }) {
    const { data: wsRes, isLoading } = useWorkspace(workspaceId);
    const { mutateAsync: updateWorkspace, isPending: isUpdating } = useUpdateWorkspace();

    const [form] = Form.useForm();
    const [logoBase64, setLogoBase64] = useState<string | null>(null);
    const [tagInput, setTagInput] = useState('');
    const [addingTag, setAddingTag] = useState(false);

    const ws = wsRes?.data;
    const { data: tagsRes } = useWorkspaceTags(workspaceId);
    const tags = tagsRes?.data || [];
    const addTag = useAddWorkspaceTag();
    const removeTag = useRemoveWorkspaceTag();

    useEffect(() => {
        if (ws) {
            form.setFieldsValue({
                name: ws.name,
                slug: ws.slug,
                timezone: ws.settings?.timezone || 'Asia/Ho_Chi_Minh',
                language: ws.settings?.language || 'vi',
            });
            if (ws.logoUrl) {
                setLogoBase64(ws.logoUrl);
            }
        }
    }, [ws, form]);

    const handleLogoChange = (info: any) => {
        const file = info.file.originFileObj || info.file;
        if (!file) return;

        const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png';
        if (!isJpgOrPng) {
            message.error('Bạn chỉ có thể tải lên file JPG/PNG!');
            return;
        }

        const isLt2M = file.size / 1024 / 1024 < 2;
        if (!isLt2M) {
            message.error('Ảnh tải lên phải nhỏ hơn 2MB!');
            return;
        }

        const reader = new FileReader();
        reader.addEventListener('load', () => {
            setLogoBase64(reader.result as string);
        });
        reader.readAsDataURL(file);
    };

    const handleAddTag = async () => {
        if (!tagInput || !tagInput.trim()) return;
        const newTag = tagInput.trim();
        if (tags.includes(newTag)) {
            message.warning('Tag đã tồn tại!');
            return;
        }
        setAddingTag(true);
        try {
            await addTag.mutateAsync({ workspaceId, tag: newTag });
            setTagInput('');
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Lỗi khi thêm tag');
        } finally {
            setAddingTag(false);
        }
    };

    const handleRemoveTag = async (removedTag: string) => {
        try {
            await removeTag.mutateAsync({ workspaceId, tag: removedTag });
        } catch (error: any) {
            message.error(error.response?.data?.message || 'Lỗi khi xóa tag');
        }
    };

    const onFinish = async (values: any) => {
        try {
            await updateWorkspace({
                id: workspaceId,
                name: values.name,
                logoUrl: logoBase64 || '',
                settings: {
                    ...(ws?.settings || {}),
                    timezone: values.timezone,
                    language: values.language,
                }
            });
            message.success('Cập nhật thông tin workspace thành công!');
        } catch (error: any) {
            message.error(error.response?.data?.error?.message || 'Có lỗi xảy ra khi cập nhật');
        }
    };

    if (isLoading) return <div style={{ textAlign: 'center', padding: '50px 0' }}><Spin size="large" /></div>;

    return (
        <div className="card" style={{ padding: '32px' }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24, color: 'var(--color-text)' }}>Thông tin chung</h2>
            
            <Form form={form} layout="vertical" onFinish={onFinish}>
                <Form.Item label="Logo Workspace" style={{ textAlign: 'center' }}>
                    <div style={{ marginBottom: 16 }}>
                        <Avatar shape="square" size={100} icon={<BuildOutlined />} src={logoBase64} />
                    </div>
                    <Upload
                        showUploadList={false}
                        beforeUpload={() => false}
                        onChange={handleLogoChange}
                    >
                        <Button icon={<UploadOutlined />}>Tải logo lên</Button>
                    </Upload>
                    <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 8 }}>
                        Định dạng JPG/PNG, tối đa 2MB. Logo này vuông tỷ lệ 1:1 là tốt nhất.
                    </div>
                </Form.Item>

                <Divider />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Form.Item label="Tên Workspace" name="name" rules={[{ required: true, message: 'Vui lòng nhập tên' }]}>
                        <Input placeholder="Nhập tên workspace" />
                    </Form.Item>
                    
                    <Form.Item label="Slug (Đường dẫn)" name="slug">
                        <Input disabled />
                    </Form.Item>

                    <Form.Item label="Múi giờ" name="timezone">
                        <Select options={[
                            { value: 'Asia/Ho_Chi_Minh', label: 'Asia/Ho_Chi_Minh (Việt Nam)' },
                            { value: 'UTC', label: 'UTC' }
                        ]} />
                    </Form.Item>

                    <Form.Item label="Ngôn ngữ chính" name="language">
                        <Select options={[
                            { value: 'vi', label: 'Tiếng Việt' },
                            { value: 'en', label: 'English' }
                        ]} />
                    </Form.Item>
                </div>

                <Divider />

                <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                    <Button type="primary" htmlType="submit" loading={isUpdating}>
                        Lưu thay đổi
                    </Button>
                </Form.Item>
            </Form>

            <Divider />
            
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, marginTop: 40, color: 'var(--color-text)' }}>Phân loại khách hàng (Tags)</h2>
            <div style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 16 }}>
                    Định nghĩa các thẻ (tags) để phân loại khách hàng trong workspace (ví dụ: VIP, Tiềm năng, Sắp chốt...). 
                    Agent có thể gắn các tag này cho cuộc hội thoại.
                </Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {tags.length === 0 ? (
                        <Text type="secondary" style={{ fontStyle: 'italic', fontSize: 13 }}>Chưa có thẻ nào.</Text>
                    ) : (
                        tags.map(tag => (
                            <Tag 
                                key={tag} 
                                closable 
                                onClose={(e) => {
                                    e.preventDefault();
                                    handleRemoveTag(tag);
                                }}
                                color="blue"
                                style={{ padding: '4px 10px', fontSize: 13 }}
                            >
                                {tag}
                            </Tag>
                        ))
                    )}
                </div>
                <Space>
                    <Input
                        placeholder="Nhập thẻ mới (VD: VIP)"
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onPressEnter={(e) => {
                            e.preventDefault();
                            handleAddTag();
                        }}
                        style={{ width: 200 }}
                    />
                    <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddTag} loading={addingTag}>
                        Thêm Thẻ
                    </Button>
                </Space>
            </div>

        </div>
    );
}
