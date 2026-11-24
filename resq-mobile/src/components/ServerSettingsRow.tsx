// ServerSettingsRow: dòng "Máy chủ" trong Cài đặt (khách + gara) — cho biết app ĐANG gửi dữ liệu tới máy chủ nào và
// dữ liệu ở đó có được giữ lâu dài không. Bài học thật: app gửi tới laptop, người kiểm tra mở admin Render → tưởng
// "đăng ký / SOS không lên admin".
import React, { useState } from 'react';
import { SettingsRow } from './ui/Settings';
import { ServerSettingsModal } from './ServerSettingsModal';
import { useAuth } from '../context/AuthContext';
import { serverHost, serverLine } from '../features/server/compat';

export const ServerSettingsRow: React.FC = () => {
  const { serverUrl, serverInfo } = useAuth();
  const [open, setOpen] = useState(false);
  const line = serverLine(serverInfo);
  return (
    <>
      <SettingsRow
        icon="server-outline"
        tone={line.temporary ? 'amber' : 'neutral'}
        title={`Máy chủ: ${serverUrl ? serverHost(serverUrl) : '(chưa có)'}`}
        subtitle={line.text}
        badge={line.temporary ? { label: 'Tạm thời', tone: 'amber' } : undefined}
        onPress={() => setOpen(true)}
      />
      <ServerSettingsModal visible={open} onClose={() => setOpen(false)} />
    </>
  );
};
