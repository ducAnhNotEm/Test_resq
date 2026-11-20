// ManeuverGlyph: mũi tên chỉ dẫn vẽ theo ĐÚNG góc rẽ (không phải 4 icon cố định),
// nên chếch phải 30° và rẽ gắt phải 135° nhìn khác nhau như trên ứng dụng dẫn đường thật.
import { memo } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import type { ManeuverType } from '../maneuvers';

interface Props { type: ManeuverType; turnDeg: number; size?: number; color?: string }

const rad = (d: number) => (d * Math.PI) / 180;
const f = (n: number) => n.toFixed(2);

export const ManeuverGlyph = memo(function ManeuverGlyph({ type, turnDeg, size = 30, color = '#FFFFFF' }: Props) {
  const stroke = { stroke: color, strokeWidth: 3.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

  if (type === 'arrive') {
    return (
      <Svg width={size} height={size} viewBox="-15 -15 30 30">
        <Path d="M 0 11 L 0 -11" {...stroke} />
        <Path d="M 0 -11 L 10 -7 L 0 -3 Z" fill={color} />
        <Circle cx="0" cy="11" r="2.4" fill={color} />
      </Svg>
    );
  }

  if (type === 'uturn') {
    // Việt Nam đi bên phải: quay đầu vòng sang trái
    const s = turnDeg > 0 ? -1 : 1;
    return (
      <Svg width={size} height={size} viewBox="-15 -15 30 30">
        <Path d={`M ${5 * s} 12 L ${5 * s} -3 A 5 5 0 0 0 ${-5 * s} -3 L ${-5 * s} 5`} {...stroke} />
        <Path d={`M ${-5 * s - 5} 3 L ${-5 * s} 10 L ${-5 * s + 5} 3 Z`} fill={color} />
      </Svg>
    );
  }

  const t = type === 'straight' ? 0 : turnDeg;
  const dx = Math.sin(rad(t));
  const dy = -Math.cos(rad(t));
  // thân: đi lên tới (0,0), rồi đi theo hướng ra dài 8; đầu mũi tên tam giác theo hướng ra
  const ex = dx * 7;
  const ey = dy * 7;
  const tipX = ex + dx * 6;
  const tipY = ey + dy * 6;
  const px = -dy;
  const py = dx;
  const head = `M ${f(tipX)} ${f(tipY)} L ${f(ex + px * 5.5)} ${f(ey + py * 5.5)} L ${f(ex - px * 5.5)} ${f(ey - py * 5.5)} Z`;
  const body = type === 'straight' ? `M 0 13 L 0 ${f(ey)}` : `M 0 13 L 0 0 L ${f(ex)} ${f(ey)}`;

  return (
    <Svg width={size} height={size} viewBox="-15 -15 30 30">
      <Path d={body} {...stroke} />
      <Path d={head} fill={color} strokeLinejoin="round" />
    </Svg>
  );
});
