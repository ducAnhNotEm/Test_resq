import React from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

export const ResQWhiteLogo: React.FC<{ width?: number; height?: number }> = ({
  width = 165,
  height = 48,
}) => (
  <Svg width={width} height={height} viewBox="0 0 210 60" fill="none">
    <Rect x="2" y="14" width="22" height="4" rx="2" fill="#FFFFFF" opacity={0.95} />
    <Rect x="9" y="23" width="16" height="3.5" rx="1.75" fill="#FFFFFF" opacity={0.85} />
    <Rect x="15" y="31" width="11" height="3" rx="1.5" fill="#FFFFFF" opacity={0.75} />
    <SvgText
      x="28"
      y="43"
      fill="#FFFFFF"
      fontSize="40"
      fontWeight="800"
      fontStyle="italic"
      letterSpacing="-1"
    >
      Res
    </SvgText>
    <G transform="translate(115, 6)">
      <Circle cx="23" cy="23" r="20" stroke="#FFFFFF" strokeWidth="6" />
      <Circle
        cx="23"
        cy="23"
        r="20"
        stroke="rgba(180,20,35,0.4)"
        strokeWidth="2.5"
        strokeDasharray="4 4"
      />
      <Rect x="20" y="13" width="6" height="20" rx="2" fill="#FFFFFF" />
      <Rect x="13" y="20" width="20" height="6" rx="2" fill="#FFFFFF" />
      <Path d="M34 35 L46 44" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" />
    </G>
  </Svg>
);

export const HighwaySunriseHeroSvg: React.FC = () => (
  <Svg
    width="100%"
    height="100%"
    viewBox="0 0 390 420"
    preserveAspectRatio="xMidYMid slice"
  >
    <Defs>
      <LinearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor="#1D63D8" />
        <Stop offset="36%" stopColor="#5D9DF0" />
        <Stop offset="56%" stopColor="#E6EDF8" />
        <Stop offset="66%" stopColor="#FDE2B8" />
      </LinearGradient>
      <RadialGradient id="sunGlow" cx="76%" cy="56%" r="36%">
        <Stop offset="0%" stopColor="#FFF7D6" stopOpacity="1" />
        <Stop offset="45%" stopColor="#FDBA74" stopOpacity="0.65" />
        <Stop offset="100%" stopColor="#FDBA74" stopOpacity="0" />
      </RadialGradient>
      <LinearGradient id="asphaltGrad" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0%" stopColor="#43384C" />
        <Stop offset="38%" stopColor="#351C2B" />
        <Stop offset="85%" stopColor="#3B060D" />
        <Stop offset="100%" stopColor="#4F040C" />
      </LinearGradient>
      <LinearGradient id="roadGlare" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#F97316" stopOpacity="0" />
        <Stop offset="60%" stopColor="#FDBA74" stopOpacity="0.55" />
        <Stop offset="100%" stopColor="#EF4444" stopOpacity="0.2" />
      </LinearGradient>
      <LinearGradient id="suvBody" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#E11D48" />
        <Stop offset="55%" stopColor="#9F1239" />
        <Stop offset="100%" stopColor="#4C0519" />
      </LinearGradient>
    </Defs>

    <Rect x="0" y="0" width="390" height="270" fill="url(#skyGrad)" />
    <Ellipse cx="315" cy="92" rx="90" ry="20" fill="#FFFFFF" opacity={0.35} />
    <Ellipse cx="270" cy="128" rx="115" ry="18" fill="#FFFFFF" opacity={0.45} />
    <Ellipse cx="90" cy="150" rx="80" ry="14" fill="#FFFFFF" opacity={0.35} />
    <Rect x="0" y="100" width="390" height="190" fill="url(#sunGlow)" />

    <G fill="#64748B" opacity={0.55}>
      <Rect x="12" y="232" width="12" height="34" />
      <Rect x="28" y="220" width="14" height="46" />
      <Rect x="46" y="236" width="10" height="30" />
      <Rect x="62" y="212" width="16" height="54" />
      <Rect x="84" y="226" width="12" height="40" />
      <Rect x="102" y="204" width="18" height="62" />
      <Rect x="124" y="218" width="13" height="48" />
      <Rect x="142" y="228" width="15" height="38" />
      <Rect x="163" y="210" width="11" height="56" />
      <Rect x="179" y="224" width="16" height="42" />
      <Rect x="202" y="234" width="14" height="32" />
      <Rect x="222" y="218" width="12" height="48" />
      <Rect x="328" y="225" width="16" height="41" />
      <Rect x="348" y="214" width="18" height="52" />
      <Rect x="370" y="230" width="16" height="36" />
    </G>

    <Rect x="0" y="264" width="390" height="156" fill="url(#asphaltGrad)" />
    <Line x1="0" y1="264" x2="390" y2="264" stroke="#E2E8F0" strokeWidth="2.5" opacity={0.7} />
    <Path d="M0 282 L390 318" stroke="#FFFFFF" strokeWidth="1.5" opacity={0.28} />
    <Path d="M0 302 L390 365" stroke="#FDE68A" strokeWidth="2" opacity={0.32} />
    <Path d="M120 264 L390 342" stroke="url(#roadGlare)" strokeWidth="24" />
    <Path d="M210 264 L390 315" stroke="#FFF7ED" strokeWidth="3" opacity={0.45} />

    <G transform="translate(206, 206)">
      <Ellipse cx="72" cy="70" rx="68" ry="10" fill="#090204" opacity={0.7} />
      <Circle cx="30" cy="60" r="14" fill="#111827" stroke="#475569" strokeWidth="2.5" />
      <Circle cx="30" cy="60" r="6" fill="#CBD5E1" />
      <Circle cx="108" cy="62" r="15" fill="#111827" stroke="#475569" strokeWidth="2.5" />
      <Circle cx="108" cy="62" r="6.5" fill="#CBD5E1" />
      <Path
        d="M14 48 L22 24 C27 14 40 10 64 10 L102 12 C116 14 128 24 134 36 L140 50 C142 56 138 62 128 62 L22 62 C12 62 10 56 14 48 Z"
        fill="url(#suvBody)"
      />
      <Path
        d="M32 24 L42 15 L88 16 L104 26 Z"
        fill="#1E293B"
        stroke="#F8FAFC"
        strokeWidth="1"
        opacity={0.9}
      />
      <Path d="M108 26 L124 26 L130 38 L108 38 Z" fill="#0F172A" />
      <Rect x="122" y="39" width="15" height="5" rx="2.5" fill="#FF2E4D" />
      <Rect x="124" y="40.5" width="10" height="2" rx="1" fill="#FFE4E6" />
      <Path d="M24 38 Q75 34 122 38" stroke="#FDA4AF" strokeWidth="1.8" opacity={0.65} />
    </G>
  </Svg>
);

export const BottomCrimsonStreaksSvg: React.FC = () => (
  <Svg
    width="100%"
    height="130"
    viewBox="0 0 390 130"
    preserveAspectRatio="none"
    style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
  >
    <Defs>
      <LinearGradient id="streak1" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0%" stopColor="#FF1F3D" stopOpacity="0" />
        <Stop offset="55%" stopColor="#FF4D6A" stopOpacity="0.85" />
        <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.9" />
      </LinearGradient>
      <LinearGradient id="streak2" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0%" stopColor="#E11D48" stopOpacity="0.1" />
        <Stop offset="50%" stopColor="#FB7185" stopOpacity="0.55" />
        <Stop offset="100%" stopColor="#FECDD3" stopOpacity="0.2" />
      </LinearGradient>
    </Defs>
    <Path d="M-20 118 Q130 98 395 40" stroke="url(#streak2)" strokeWidth="22" fill="none" opacity={0.35} />
    <Path d="M-10 122 Q150 100 395 54" stroke="url(#streak1)" strokeWidth="4" fill="none" />
    <Path d="M30 130 Q210 106 395 78" stroke="url(#streak1)" strokeWidth="2" fill="none" opacity={0.65} />
  </Svg>
);

export const PhoneMockIllustration: React.FC = () => (
  <Svg width={78} height={82} viewBox="0 0 80 86" fill="none">
    <Defs>
      <LinearGradient id="phoneScreenGrad" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#E11D48" />
        <Stop offset="60%" stopColor="#881337" />
        <Stop offset="100%" stopColor="#2A050A" />
      </LinearGradient>
    </Defs>
    <G transform="rotate(8 40 43)">
      <Rect x="21" y="5" width="40" height="74" rx="8" fill="#0F172A" stroke="#94A3B8" strokeWidth="1.8" />
      <Rect x="24" y="8" width="34" height="68" rx="6" fill="url(#phoneScreenGrad)" />
      <Rect x="34" y="11" width="14" height="3.2" rx="1.6" fill="#09090B" />
      <SvgText x="41" y="36" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="800" fontStyle="italic">
        ResQ
      </SvgText>
      <Path d="M25 60 Q40 52 57 44" stroke="#FDA4AF" strokeWidth="1.6" opacity={0.85} />
    </G>
  </Svg>
);

export const CarScreenIllustration: React.FC = () => (
  <Svg width={108} height={82} viewBox="0 0 112 86" fill="none">
    <Defs>
      <LinearGradient id="carDisplayGrad" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0%" stopColor="#26060A" />
        <Stop offset="50%" stopColor="#B91C1C" />
        <Stop offset="100%" stopColor="#3B0409" />
      </LinearGradient>
    </Defs>
    <Rect x="4" y="14" width="104" height="58" rx="8" fill="#0B0F19" stroke="#64748B" strokeWidth="1.8" />
    <Rect x="9" y="19" width="94" height="48" rx="5" fill="url(#carDisplayGrad)" />
    <Rect x="9" y="19" width="14" height="48" rx="4" fill="rgba(0,0,0,0.45)" />
    <Circle cx="16" cy="28" r="2.2" fill="#E2E8F0" />
    <Circle cx="16" cy="38" r="2.2" fill="#FB7185" />
    <Circle cx="16" cy="48" r="2.2" fill="#94A3B8" />
    <Circle cx="16" cy="58" r="2.2" fill="#94A3B8" />
    <SvgText x="62" y="43" textAnchor="middle" fill="#FFFFFF" fontSize="13" fontWeight="800" fontStyle="italic">
      ResQ
    </SvgText>
    <Path d="M24 58 Q60 50 102 44" stroke="#FF6B81" strokeWidth="1.8" opacity={0.85} />
  </Svg>
);

export const QBinMascotSvg: React.FC<{ size?: number }> = ({ size = 56 }) => (
  <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
    <Path d="M22 46C22 28 33 17 48 17C63 17 74 28 74 46" stroke="#E11D48" strokeWidth="6" strokeLinecap="round" />
    <Rect x="12" y="40" width="12" height="22" rx="6" fill="#E11D48" />
    <Rect x="72" y="40" width="12" height="22" rx="6" fill="#E11D48" />
    <Circle cx="48" cy="52" r="30" fill="#1E293B" stroke="#0F172A" strokeWidth="3" />
    <Circle cx="48" cy="52" r="27" stroke="#334155" strokeWidth="3" strokeDasharray="6 5" />
    <Circle cx="48" cy="52" r="20" fill="#F8FAFC" />
    <Path d="M28 35C34 25 62 25 68 35C58 31 38 31 28 35Z" fill="#E11D48" />
    <Circle cx="41" cy="50" r="3.2" fill="#0F172A" />
    <Circle cx="42" cy="49" r="1.1" fill="#FFFFFF" />
    <Path d="M52 50C53.5 47.5 57.5 47.5 59 50" stroke="#0F172A" strokeWidth="2.8" strokeLinecap="round" />
    <Ellipse cx="35.5" cy="55" rx="3" ry="1.8" fill="#FDA4AF" />
    <Ellipse cx="60.5" cy="55" rx="3" ry="1.8" fill="#FDA4AF" />
    <Path d="M42 57C44.5 61 51.5 61 54 57" stroke="#0F172A" strokeWidth="2.6" strokeLinecap="round" />
    <Rect x="37" y="75" width="22" height="10" rx="5" fill="#2563EB" />
    <SvgText x="48" y="82.5" textAnchor="middle" fill="#FFFFFF" fontSize="7" fontWeight="800">
      ResQ
    </SvgText>
  </Svg>
);
