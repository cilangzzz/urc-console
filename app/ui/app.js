// app.js — URC Console frontend v0.2 (tabs + dynamic FX panels + capability probe)
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

let defs = {};              // name -> def {id,min,max,default,channel_indexed}
const ALL_CONTROLS = [];    // {id, ch, refresh(v|null)} — for batch probe

// Chinese labels for known params (fallback: raw name)
const L = {
  // mixer
  ChPairOnf: "立体声配对", ChPhaseOnf: "相位反转", ChHpfOnf: "低切", ChHpfFreq: "低切频率",
  HaP48VOnf: "48V 幻象电源", HaInputGain: "输入增益档",
  ChSendMixBus1Level: "音量", ChSendMixBus2Level: "音量", ChSendFxBusLevel: "FX 发送",
  ChSendMixBus1Pan: "声像", ChSendMixBus2Pan: "声像",
  ChSendMixBus1Onf: "静音", ChSendMixBus2Onf: "静音",
  ChSendMixBus1SoloOnf: "独奏", ChSendMixBus2SoloOnf: "独奏",
  DawSendMixBus1Level: "DAW→Mix1", DawSendMixBus2Level: "DAW→Mix2",
  DawSendMixBus1Onf: "静音", DawSendMixBus2Onf: "静音",
  MasterMixBus1Level: "总音量", MasterMixBus2Level: "总音量",
  MasterMixBus1Bal: "平衡", MasterMixBus2Bal: "平衡",
  MasterMixBus1Onf: "静音", MasterMixBus2Onf: "静音",
  // SSM channel strip
  FxCompBypass: "压缩旁通", FxCompDrive: "Drive", FxCompAttack: "启动 Attack", FxCompRelease: "释放 Release",
  FxCompRatio: "比率 Ratio", FxCompKnee: "拐点 Knee", FxCompThreshOfst: "阈值偏移", FxCompMakeupOfst: "补偿增益",
  FxCompScOnf: "侧链启用", FxCompScFreq: "侧链频率", FxCompScGain: "侧链增益", FxCompScQual: "侧链Q值",
  FxEqBypass: "EQ 旁通", FxEqHsvOnf: "高频段启用", FxEqHsvFreq: "高频频率", FxEqHsvGain: "高频增益",
  FxEqMidOnf: "中频段启用", FxEqMidFreq: "中频频率", FxEqMidGain: "中频增益", FxEqMidQual: "中频Q值",
  FxEqLsvOnf: "低频段启用", FxEqLsvFreq: "低频频率", FxEqLsvGain: "低频增益", FxEqPeqGain: "峰值 EQ 增益",
  FxMorphValue: "Morph 变形", FxStereoLinkOnf: "立体声链接",
  // RevX
  FxRevBypass: "混响旁通", FxRevType: "混响类型", FxRevTime: "时间 Time", FxRevDiff: "扩散 Diffusion",
  FxRevIniDly: "初始延迟", FxRevHpf: "高通滤波", FxRevLpf: "低通滤波", FxRevRoomSize: "房间尺寸",
  FxRevHighRatio: "高频衰减比", FxRevLowRatio: "低频衰减比", FxRevDecay: "衰减 Decay", FxRevBal: "平衡",
  FxRevLowFreq: "低频交点",
  FxRevMixBus1Onf: "Mix1 发送启用", FxRevMixBus2Onf: "Mix2 发送启用",
  FxRevMixBus1Level: "Mix1 发送电平", FxRevMixBus2Level: "Mix2 发送电平",
  // delay
  FxDelayStereo: "立体声延迟", FxDelayTime: "延迟时间", FxDelayHighRatio: "高频比", FxDelayFeedback: "反馈",
  // guitar amp
  GtrFxBypass: "吉他箱体旁通", GtrFxType: "放大器类型",
  GtrFxGateOnf: "噪声门启用", GtrFxGateLevel: "噪声门电平", GtrFxGateRange: "噪声门范围",
  GtrFxGateAttack: "噪声门启动", GtrFxGateHold: "噪声门保持", GtrFxGateDecay: "噪声门衰减",
  // guitar amp — editor display names (display only; per-model sections in the editor)
  GtrFxCleanVolume: "音量", GtrFxCleanDistortion: "失真", GtrFxCleanBlend: "干湿混合",
  GtrFxCleanChorus: "合唱/颤音", GtrFxCleanVibSpeed: "速度", GtrFxCleanVibDepth: "深度",
  GtrFxCleanTreble: "高音", GtrFxCleanMiddle: "中音", GtrFxCleanBass: "低音", GtrFxCleanHiTreble: "临场感",
  GtrFxCleanSpType: "箱体型号", GtrFxCleanMicPosition: "话筒位", GtrFxCleanOutput: "输出 OUTPUT",
  GtrFxCrunchType: "口味", GtrFxCrunchVolume: "音量 GAIN",
  GtrFxCrunchTreble: "高音", GtrFxCrunchMiddle: "中音", GtrFxCrunchBass: "低音", GtrFxCrunchPresence: "临场感",
  GtrFxCrunchSpType: "箱体型号", GtrFxCrunchMicPosition: "话筒位", GtrFxCrunchOutput: "输出 OUTPUT",
  GtrFxLeadSensitivity: "灵敏度", GtrFxLeadPreAmp: "前级 GAIN", GtrFxLeadMaster: "Master",
  GtrFxLeadTreble: "高音", GtrFxLeadMiddle: "中音", GtrFxLeadBass: "低音", GtrFxLeadPresence: "临场感",
  GtrFxLeadSpType: "箱体型号", GtrFxLeadMicPosition: "话筒位", GtrFxLeadOutput: "输出 OUTPUT",
  GtrFxDriveType: "AMP TYPE", GtrFxDriveGain: "GAIN", GtrFxDriveMaster: "Master",
  GtrFxDriveTreble: "高音", GtrFxDriveMiddle: "中音", GtrFxDriveBass: "低音", GtrFxDrivePresence: "临场感",
  GtrFxDriveSpType: "箱体型号", GtrFxDriveMicPosition: "话筒位", GtrFxDriveOutput: "输出 OUTPUT",
  // pitch fix — editor display names (tips exist in PARAM_TIPS)
  PitchFixCorrectKey: "调 Key", PitchFixCorrectScale: "音阶 Scale",
  PitchFixCorrectRate: "修音力度", PitchFixCorrectSense: "灵敏度",
  PitchFixMidiControlMode: "模式", PitchFixMidiNoteLimitLow: "音符下限", PitchFixMidiNoteLimitHigh: "音符上限",
  // pitch fix
  PitchFixOnf: "Pitch Fix 启用", PitchFixMixLevel: "混合电平",
  PitchFixLeadTranspose: "主声部移调", PitchFixLeadFormant: "主声部共振峰",
  PitchFixHarmTranspose: "和声移调", PitchFixHarmFormant: "和声共振峰",
  PitchFixHarmCorrectSense: "和声修正灵敏度", PitchFixMidiControlOnf: "MIDI 控制",
  // routing / system
  PatchLoopbackMode: "回环模式", PatchMonoSw: "单声道总输出", PatchInputDawMix: "输入/DAW 混音",
  PatchRecnShareLoopOnf: "识别共享回环", PatchAuxPhoneOutput: "耳机输出源",
  PatchDawMeter: "DAW 电平源", PatchMasterMeter: "主电平源", PatchFxSend: "FX 发送补丁",
  SysFsCode: "采样率", SysRecnShareMode: "识别共享模式", SysUsbChOrder: "USB 通道顺序",
};

const FX_GROUPS = [
  { title: "Sweet Spot Morphing 通道条(压缩 + EQ + Morph)", match: n => /^(FxComp|FxEq|FxMorphValue|FxStereoLink)/.test(n), ch: 0 },
  { title: "REV-X 混响", match: n => /^FxRev/.test(n) && !/MixBus[34]/.test(n), ch: 0 },
  { title: "Delay 延迟", match: n => /^FxDelay/.test(n), ch: 0 },
  { title: "Guitar Amp Classics 吉他箱体模拟", match: n => /^GtrFx/.test(n), ch: 0 },
  { title: "Pitch Fix(按输入通道)", match: n => /^PitchFix/.test(n), ch: "per" },
  { title: "通道 FX 插入槽(按输入通道)", match: n => /^(ChFxIns|FxIns)/.test(n), ch: "per" },
];

const ROUTE_LIST = [
  "PatchLoopbackMode", "PatchMonoSw", "PatchInputDawMix", "PatchRecnShareLoopOnf",
  "PatchAuxPhoneOutput", "PatchDawMeter", "PatchMasterMeter", "PatchFxSend",
  "SysFsCode", "SysRecnShareMode", "SysUsbChOrder",
];

const LOOPBACK_LABELS = ["关闭", "仅 DAW", "仅 AUX", "DAW + AUX"];
const FS_LABELS = ["44.1 kHz", "48 kHz", "88.2 kHz", "96 kHz", "176.4 kHz", "192 kHz"];
const REVTYPE_LABELS = ["Hall", "Room", "Plate", "Delay"];
const GTRTYPE_LABELS = ["CLEAN", "CRUNCH", "LEAD", "DRIVE"];
// ChFxInsType 0-8 (exe slot-case mapping: 1=ChStrip, 2-5=GA CLEAN/CRUNCH/LEAD/DRIVE, 6=PitchFix)
const SLOTTYPE_LABELS = ["无效果", "Morphing Ch Strip", "GA CLEAN", "GA CRUNCH", "GA LEAD", "GA DRIVE", "Pitch Fix", "类型 7", "类型 8"];
const SLOT_TITLE = {
  1: "Sweet Spot Morphing Ch.Strip",
  2: "GA Classics", 3: "GA Classics", 4: "GA Classics", 5: "GA Classics",
  6: "PitchFix",
  8: "REV-X",
};

// editor-only label constants (0.4 节):下拉/读数用,不进主窗通用网格
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = v => NOTE_NAMES[v % 12] + (Math.floor(v / 12) - 1);   // 0="C-2", 127="G8"
const SPTYPE_LABELS = ["BS 4x12", "AC 2x12", "AC 1x12", "AC 4x10", "BC 2x12", "AM 4x12", "YC 4x12", "JC 2x12"]; // raw 1..8
const MICPOS_LABELS = ["Center", "Edge"];
const CHORUS_LABELS = ["OFF", "Cho", "Vib"];            // raw 0/1/2
const CRUNCHTYPE_LABELS = ["Normal", "Bright"];
const LEADSENS_LABELS = ["Low", "High"];                // raw 0/1,方向低置信,tip 已写清
const DRIVETYPE_LABELS = ["1 Raw", "2 Raw +", "3 Vintage", "4 Vintage +", "5 Modern", "6 Modern +"]; // raw 0..5
const KEY_LABELS = NOTE_NAMES;                          // raw 0..11 = C..B
const SCALE_LABELS = ["CUSTOM", "SINGLE", "MAJOR", "NATURAL MINOR", "HARMONIC MINOR", "MELODIC MINOR", "PENTATONIC", "CHROMATIC"]; // raw 0..7, init 7
const MIDIMODE_LABELS = ["SETTING", "REAL TIME"];
const STEREO_LABELS = ["MONO", "STEREO"];

// display conversions (official editor formats, RE'd from ChannelStrip_UR-C.dll)
function fmtHz(hz) {
  if (hz >= 1000) return (hz / 1000).toFixed(1) + " kHz";
  return Math.round(hz) + " Hz";
}
function pitchFreqHz(raw) { return 20 * Math.pow(2, (raw - 4) / 12); }
const PARAM_DISPLAYS = {
  FxCompDrive: v => (v / 10).toFixed(2),
  FxCompAttack: v => (v / 10).toFixed(1) + " ms",
  FxCompRelease: v => (v / 10).toFixed(1) + " ms",
  FxCompScFreq: v => fmtHz(pitchFreqHz(v)),
  FxEqMidFreq: v => fmtHz(pitchFreqHz(v)),
  FxEqLsvFreq: v => fmtHz(pitchFreqHz(v)),
  FxEqHsvFreq: v => fmtHz(pitchFreqHz(v)),
  FxCompScGain: v => ((v - 180) / 10).toFixed(1) + " dB",
  FxEqMidGain: v => ((v - 180) / 10).toFixed(1) + " dB",
  FxEqLsvGain: v => ((v - 180) / 10).toFixed(1) + " dB",
  FxEqHsvGain: v => ((v - 180) / 10).toFixed(1) + " dB",
  FxEqPeqGain: v => ((v - 180) / 10).toFixed(1) + " dB",
  FxMorphValue: v => (v / 120 * 100).toFixed(0) + "%",
  // editor additions (0.4 节):范围端点与官方手册吻合,高置信
  FxDelayTime: v => (v / 10).toFixed(1) + " ms",            // raw 1..13000 = 0.1..1300 ms
  FxDelayFeedback: v => String(v - 64),                     // raw 64..127 = 官方 0..63
  FxRevHighRatio: v => (v / 10).toFixed(1),                 // 0.1..1.0
  FxRevLowRatio: v => (v / 10).toFixed(1),                  // 0.1..1.4
  FxDelayHighRatio: v => (v / 10).toFixed(1),               // 0.1..1.0
  PitchFixLeadTranspose: v => (v / 100).toFixed(2) + " 半音", // ±1200 raw = ±12.00
  PitchFixHarmTranspose: v => (v / 100).toFixed(2) + " 半音",
  PitchFixLeadFormant: v => (v - 64 > 0 ? "+" : "") + (v - 64),   // 2..126 = ±62, 64=原样
  PitchFixHarmFormant: v => (v - 64 > 0 ? "+" : "") + (v - 64),
  PitchFixMidiNoteLimitLow: v => noteName(v),
  PitchFixMidiNoteLimitHigh: v => noteName(v),
  // 换算未标定,显示原值并保留 tip:FxRevTime/IniDly/Hpf/Lpf/LowFreq、FxCompRatio、FxCompScQual/MidQual
};

function labelOf(name) { return L[name] || name; }

// ---------- parameter tooltips (圆形问号提示) ----------
const PARAM_TIPS = {
  // mixer strips
  HaP48VOnf: "给麦克风供电的开关。电容麦克风必须打开才有声音，动圈麦克风保持关闭就行。",
  ChPhaseOnf: "把声音的波形整个反过来用。两支麦克风同时收音、听起来又空又薄时，打开试试，声音会变厚实。",
  ChHpfOnf: "切掉低频里隆隆的杂音，像空调声、踩脚声、手蹭麦克风的声音。正常人声听不出变化，平时开着就好。",
  ChHpfFreq: "从多低的频率开始切的档位（40 到 120 五档）。数字越大切得越多，声音越干净也越单薄，一般选 80 或 100。",
  ChSendMixBus1Level: "这路声音在 Mix1 监听混音里的音量，越大听得越响。想调耳机里自己声音的大小就动它。",
  ChSendMixBus1Pan: "这路声音在 Mix1 里放左边还是右边：0 是正中，越小越靠左，越大越靠右。",
  ChSendMixBus1Onf: "打开后 Mix1 里就听不到这路声音了，但录进电脑的录音不受影响。",
  ChSendMixBus1SoloOnf: "打开后 Mix1 里只放这一路，其他全听不见。单独检查这路声音用，听完记得关掉。",
  ChSendMixBus2Level: "这路声音在 Mix2 监听混音里的音量，越大听得越响。只管 Mix2，不影响 Mix1。",
  ChSendMixBus2Pan: "这路声音在 Mix2 里放左边还是右边：0 是正中，越小越靠左，越大越靠右。",
  ChSendMixBus2Onf: "打开后 Mix2 里就听不到这路声音了，但录进电脑的录音不受影响。",
  ChSendMixBus2SoloOnf: "打开后 Mix2 里只放这一路，其他全听不见。单独试这路声音用，听完记得关掉。",
  DawSendMixBus1Level: "电脑里播放的声音（比如伴奏）送到 Mix1 的音量，越大伴奏越响。录歌时想调伴奏大小就动它。",
  DawSendMixBus1Bal: "电脑播放的声音在 Mix1 里偏左还是偏右：0 居中，越小越靠左，越大越靠右。一般保持 0。",
  DawSendMixBus1Onf: "打开后 Mix1 里就听不到电脑放的声音了，只影响监听，电脑本身照常播放。",
  DawSendMixBus2Level: "电脑里播放的声音（比如伴奏）送到 Mix2 的音量，越大在 Mix2 里听到的伴奏越响。",
  DawSendMixBus2Bal: "电脑播放的声音在 Mix2 里偏左还是偏右：0 居中，越小越靠左，越大越靠右。",
  DawSendMixBus2Onf: "打开后 Mix2 里就听不到电脑放的声音了，只影响 Mix2 的监听。",
  MasterMixBus1Level: "整个 Mix1 混音的总音量，耳机音箱听到的整体大小都归它管。整体太吵或太轻时调它。",
  MasterMixBus1Bal: "整个 Mix1 混音偏左还是偏右：0 居中，越小越靠左，越大越靠右。两边音量不一样时才用来补，平时保持 0。",
  MasterMixBus1Onf: "Mix1 的总静音开关，打开后整个 Mix1 没声了。想临时安静一下时用。",
  MasterMixBus2Level: "整个 Mix2 混音的总音量，只管 Mix2，和 Mix1 互不影响。整体音量不合适时调它。",
  MasterMixBus2Bal: "整个 Mix2 混音偏左还是偏右：0 居中，越小越靠左，越大越靠右。平时不用动。",
  MasterMixBus2Onf: "Mix2 的总静音开关，打开后整个 Mix2 没声了，Mix1 不受影响。",

  // FX insert slots
  ChFxInsType1: "给通道的第一个效果槽挑效果（通道条、吉他模拟、修音这些），选“无效果”就是不用。选好后点旁边的“编辑”去调。",
  ChFxInsOnf1: "这个效果槽的开关。关了之后里面的效果暂时不生效，但挑好的效果类型还留着。",
  ChFxInsType2: "给通道的第二个效果槽挑效果，用法和第一个槽一样。一个槽够用的话，这里保持“无效果”。",
  ChFxInsOnf2: "第二个效果槽的开关。打开就生效，关闭暂时不用，选好的效果类型不会丢。",
  ChFxInsPrePatch: "效果器前端的内部接线参数，正常使用碰不到。保持默认即可。",
  ChFxInsPostPatch: "效果器后端的内部接线参数，正常使用碰不到。保持默认即可。",
  ChFxInsPoint: "切换效果的插入位置（内部路由用）。正常调效果不需要动它，拿不准就保持默认。",
  ChFxInsPatch1: "第一个效果槽对应的内部处理槽编号，由程序自动管理。请保持默认，不要手动改。",
  ChFxInsPatch2: "第二个效果槽对应的内部处理槽编号，由程序自动管理。保持默认即可。",

  // compressor / EQ / Morph
  FxStereoLinkOnf: "打开后左右两边的参数一起动，改一个另一个跟着变。想左右各调各的就关掉。",
  FxCompBypass: "打开就不压缩了，关掉压缩才起作用。发现怎么调都没反应，先看是不是把它打开了。",
  FxCompDrive: "把声音先推大一点再压缩，越大压缩感越强。想让声音更平稳就慢慢往大加。",
  FxCompAttack: "压缩器出手多快，越小反应越快。声音突然冲一下没压住，就把它调小。",
  FxCompRelease: "声音变小之后多快松开压缩。太快太慢听着都可能不自然，调到顺耳就行。",
  FxCompRatio: "压缩力度，越大压得越狠，忽大忽小的音量被拉得越平。想更稳就加大，想更自然就减小。",
  FxCompKnee: "压缩开始得柔和还是突然，分软、中、硬三档。软的是提前慢慢压，听着自然，硬的是到门槛才突然压住。",
  FxCompThreshOfst: "压缩门槛（多大声才开始压）的微调，默认就挺合适。不懂就别动它。",
  FxCompMakeupOfst: "压缩会把声音压小，这个旋钮把音量补回来。觉得压完声音变小了，就往大加。",
  FxCompScFreq: "压缩器靠“听”声音决定什么时候压，这里设它重点听哪个音高。想精细控制压缩才需要动它。",
  FxCompScGain: "压缩器听声音时，这个音高段说话的分量有多大。调大它就更容易触发压缩，调小就更容易被忽略。",
  FxCompScQual: "压缩器盯的那段音高管多宽：数值越大管得越窄越准，越小管得越宽。",
  FxMorphValue: "在两组现成的压缩加 EQ 设置之间平滑切换，0 是 A 组，越大越像 B 组。不用一个个调，拧到听着舒服就行。",
  FxEqBypass: "打开就跳过 EQ，调过的高中低音全部失效。发现调音没反应，先检查是不是开了它。",
  FxEqHsvFreq: "从这里往上的声音都算“高频段”。配合高频增益用：增益一动，这个点以上的声音整体跟着变。",
  FxEqHsvGain: "把高音整体调亮还是调暗。声音发闷就加一点，太刺耳就减一点。",
  FxEqMidFreq: "中频段对准哪个音高。人声大多在中频，想突出或减弱人声就在这里调。",
  FxEqMidGain: "在选中的音高上把声音加厚或减薄。声音空洞就加一点，鼻音重、发闷就减一点。",
  FxEqMidQual: "中频一次管多宽的范围。越大改得越精准，只动一小段，越小一动就是一大片。",
  FxEqLsvFreq: "从这里往下的声音都算“低频段”。配合低频增益用：增益一动，这个点以下的声音整体跟着变。",
  FxEqLsvGain: "把低音整体加重还是减轻。声音单薄就加一点，浑浊轰隆隆就减一点。",
  FxEqPeqGain: "整个 EQ 的总输出音量，调完高低音后想整体加大或减小就动它。拿不准就保持默认。",
  FxStereoLinkInfo: "官方没公开用途的内部参数，保持默认就行，不要动它。",
  FxEqHsvOnf: "高频段的总开关。打开后高频频率、增益这两个旋钮才起作用，关了高频保持原样。",
  FxEqMidOnf: "中频段的总开关。打开后中频那几个旋钮才生效，关了中频不动。",
  FxEqLsvOnf: "低频段的总开关。打开后低频频率、增益才起作用，关了低音不动。",
  FxCompScOnf: "打开后压缩器改成只听某一段声音来决定什么时候压，要配合旁边的频率、增益几个钮用。平时不用开，想精细调才碰。",

  // REV-X reverb
  FxRevMixBus1Level: "混响在 Mix1 里的音量。拧太小听不见混响，太大又会轰隆隆盖过原声。",
  FxRevMixBus1Onf: "把混响接进 Mix1 这路混音的开关。不开的话，Mix1 里完全听不到混响。",
  FxRevMixBus2Level: "混响在 Mix2 里的音量。拧大混响才明显，太大容易盖过原声。",
  FxRevMixBus2Onf: "把混响接进 Mix2 这路混音的开关。不开的话，Mix2 里完全听不到混响。",
  FxRevBypass: "混响的旁通开关。打开等于把混响短路掉，声音不带任何回声，想用混响请保持关闭。",
  FxRevType: "混响风格四选一：Hall 像音乐厅，Room 像小房间，Plate 像老式铁板（回声密实明亮），Delay 其实是回声。",
  FxRevTime: "回声拖尾的长短。越大声音的尾巴越长，从浴室感一路到山谷感。",
  FxRevDiff: "回声尾巴的密实程度。越大越连成一片显得平滑，越小越能听出一颗颗的小回声。",
  FxRevIniDly: "原声和第一声回声之间的间隔。越大越像大空间，回声来得越迟。",
  FxRevHpf: "切掉混响里的低频隆隆声。数值越大切得越多，混响听起来更干净。",
  FxRevLpf: "切掉混响里的高频嘶声。数值越小切得越多，混响越暗，调大则更亮。",
  FxRevRoomSize: "模拟房间的大小。越大像在大礼堂里发声，越小像在小卧室里。",
  FxRevHighRatio: "混响尾巴里高频消失的速度。觉得混响发刺或发闷，就在这里调。",
  FxRevLowRatio: "混响尾巴里低频消失的速度。混响低音太轰头时可以动它。",
  FxRevDecay: "混响整体拖尾长度的总闸。越大回声消失得越慢，拖得越绵长。",
  FxRevBal: "原声和混响声的比例。调到既能听清原声又带一点空间感的位置就好。",
  FxRevLowFreq: "混响尾巴里低音和高音衰减快慢的分界线，一般不用动。",

  // delay
  FxDelayStereo: "立体声延迟开关。打开后左右两边各自回声，声音更宽更梦幻，关掉则两边完全一样。",
  FxDelayTime: "每两声回声之间隔多久。越大回声来得越慢、隔得越开，像空旷山谷里喊话。",
  FxDelayHighRatio: "回声重复时高频保留的程度。决定回声是一遍比一遍闷，还是一遍遍都清晰。",
  FxDelayFeedback: "回声重复的次数。越大回声越多越连绵，太大容易吵成一团。",

  // guitar amp classics
  GtrFxBypass: "吉他音色模拟的旁通开关。打开等于全部跳过直接出原声，想用音色请保持关闭。",
  GtrFxType: "四种音箱风格选一个。CLEAN 干净清亮，CRUNCH 轻微破音，LEAD 主奏级猛失真，DRIVE 硬核失真。",
  GtrFxCleanBlend: "干净声和失真声的混合比例。两头拧着听，停在自己喜欢的位置。",
  GtrFxCleanVolume: "这个吉他音色的音量。越大越响，只影响吉他音色本身。",
  GtrFxCleanDistortion: "失真量。清音风格里拧大它就开始破音，想要完全干净就保持 0。",
  GtrFxCleanBass: "低音。越大低频越厚实，轰头就调小。",
  GtrFxCleanMiddle: "中音。越大声音越冲越饱满，越小越收敛单薄。",
  GtrFxCleanTreble: "高音。越大越明亮，觉得刺耳就调小。",
  GtrFxCleanHiTreble: "最亮一档的高音微调。越大音色越尖亮，发毛刺就往回收。",
  GtrFxCleanUserParam07: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxCleanOutput: "吉他音色处理完的总输出音量。调太大容易爆音，当总闸收尾用。",
  GtrFxCleanUserParam09: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxCleanSpType: "模拟哪种吉他音箱，共 8 种经典箱体。不同箱子味道不同，凭耳朵挑。",
  GtrFxCleanSpAir: "空气感三档选择。给音箱声加一点空间氛围，档位越高空间感越强。",
  GtrFxCleanMicPosition: "模拟录音话筒对准音箱的位置。中心位声音更亮更冲，边缘位更暗更柔，切换对比着听。",
  GtrFxCleanChorus: "合唱和颤音的选择。Chorus 让声音变宽变厚，Vibrato 让音高轻微晃动，Off 关闭。",
  GtrFxCleanVibSpeed: "晃动的速度。越大合唱或颤音晃得越快。",
  GtrFxCleanVibDepth: "晃动的深度。越大合唱或颤音效果越明显。",
  GtrFxCleanHidInput: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxCleanHidMaxOut: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxCrunchType: "Normal 和 Bright 两种口味切换。Bright 更亮一些，听听哪个顺耳。",
  GtrFxCrunchVolume: "这个吉他音色的音量。越大越响，只影响吉他音色本身。",
  GtrFxCrunchUserParam02: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxCrunchBass: "低音。越大低频越厚，轰头就调小。",
  GtrFxCrunchMiddle: "中音。越大声音越冲越饱满，越小越单薄。",
  GtrFxCrunchTreble: "高音。越大越明亮，觉得刺耳就调小。",
  GtrFxCrunchPresence: "临场感（比高音更抢耳的亮度）。越大声音越锋利突出，扎耳朵就调小。",
  GtrFxCrunchUserParam07: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxCrunchOutput: "吉他音色处理完的总输出音量。调太大容易爆音，当总闸收尾用。",
  GtrFxCrunchUserParam09: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxCrunchSpType: "模拟哪种吉他音箱，共 8 种经典箱体。不同箱子味道不同，凭耳朵挑。",
  GtrFxCrunchSpAir: "空气感三档选择。给音箱声加一点空间氛围，档位越高空间感越强。",
  GtrFxCrunchMicPosition: "模拟录音话筒对准音箱的位置。中心位声音更亮更冲，边缘位更暗更柔，切换对比着听。",
  GtrFxCrunchUserParam13: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxCrunchUserParam14: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxCrunchUserParam15: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxCrunchHidInput: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxCrunchHidMaxOut: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxLeadSensitivity: "输入灵敏度高低挡。High 挡信号推得更猛更容易出失真，Low 挡更稳更干净。",
  GtrFxLeadPreAmp: "前级推动量。往里灌得越足失真越猛，是最能改变音色狠度的钮。",
  GtrFxLeadUserParam02: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxLeadBass: "低音。越大低频越厚，轰头就调小。",
  GtrFxLeadMiddle: "中音。越大声音越冲越饱满，越小越单薄。",
  GtrFxLeadTreble: "高音。越大越明亮，觉得刺耳就调小。",
  GtrFxLeadPresence: "临场感（比高音更抢耳的亮度）。越大声音越锋利突出，扎耳朵就调小。",
  GtrFxLeadMaster: "失真后的总音量。前面推得太猛时，用它把音量收回来。",
  GtrFxLeadOutput: "吉他音色处理完的总输出音量。调太大容易爆音，当总闸收尾用。",
  GtrFxLeadUserParam09: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxLeadSpType: "模拟哪种吉他音箱，共 8 种经典箱体。不同箱子味道不同，凭耳朵挑。",
  GtrFxLeadSpAir: "空气感三档选择。给音箱声加一点空间氛围，档位越高空间感越强。",
  GtrFxLeadMicPosition: "模拟录音话筒对准音箱的位置。中心位声音更亮更冲，边缘位更暗更柔，切换对比着听。",
  GtrFxLeadUserParam13: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxLeadUserParam14: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxLeadUserParam15: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxLeadHidInput: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxLeadHidMaxOut: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxDriveType: "失真口味六选一。Raw 原始粗犷，Vintage 复古耐听，Modern 现代凶猛，每组两档，凭耳朵挑。",
  GtrFxDriveGain: "失真量。越大破音越猛，调小就接近清音。",
  GtrFxDriveUserParam02: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxDriveBass: "低音。越大低频越厚，轰头就调小。",
  GtrFxDriveMiddle: "中音。越大声音越冲越饱满，越小越单薄。",
  GtrFxDriveTreble: "高音。越大越明亮，觉得刺耳就调小。",
  GtrFxDrivePresence: "临场感（比高音更抢耳的亮度）。越大声音越锋利突出，扎耳朵就调小。",
  GtrFxDriveMaster: "失真后的总音量。前面推得太猛时，用它把音量收回来。",
  GtrFxDriveOutput: "吉他音色处理完的总输出音量。调太大容易爆音，当总闸收尾用。",
  GtrFxDriveUserParam09: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxDriveSpType: "模拟哪种吉他音箱，共 8 种经典箱体。不同箱子味道不同，凭耳朵挑。",
  GtrFxDriveSpAir: "空气感三档选择。给音箱声加一点空间氛围，档位越高空间感越强。",
  GtrFxDriveMicPosition: "模拟录音话筒对准音箱的位置。中心位声音更亮更冲，边缘位更暗更柔，切换对比着听。",
  GtrFxDriveUserParam13: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxDriveUserParam14: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxDriveUserParam15: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxDriveHidInput: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxDriveHidMaxOut: "官方没公开用途的内部参数，保持默认就行。",
  GtrFxGateOnf: "噪声门开关。停止弹琴时自动把信号闭掉，嗡嗡的底噪和杂音就听不见了。",
  GtrFxGateLevel: "门限高度。音量低于这条线的都被当成杂音闭掉，调太高会把轻弹的音也掐掉。",
  GtrFxGateRange: "关门时把声音压低多少。越大安静得越彻底，越小还会漏一点残余声。",
  GtrFxGateAttack: "开门的反应速度。觉得弹下去第一个音头被削掉了，就回来调它。",
  GtrFxGateHold: "关门前的等待时间。声音掉下去后再等这么久才关门，防止音尾断断续续。",
  GtrFxGateDecay: "关门时声音淡出的速度。太快显得生硬，太慢杂音又会漏回来，听着顺耳即可。",
  GtrFxStereoProcessing: "内部处理方式的开关，官方没细说用途。保持默认就好。",

  // pitch fix
  PitchFixOnf: "Pitch Fix 修音效果的总开关。打开后它才开始工作（修音、移调、和声都归它管），不用就关着。",
  PitchFixLeadTranspose: "把人声整体升调或降调（移调），100 相当于琴键上一个半音，正数升高、负数降低。一般保持 0。",
  PitchFixLeadFormant: "共振峰管的是音色不是音高：往两边调，声音会变得像另一个人。中间值 64 是原样，一般不用动。",
  PitchFixHarmTranspose: "调和声部分（自动加的第二声部）整体升调还是降调，100 相当于一个半音。不用和声就保持 0。",
  PitchFixHarmFormant: "调和声的音色，不改变音高，中间值 64 是原样。和声听着别扭时再微调，平时不用动。",
  PitchFixHarmCorrectSense: "和声修音的积极程度：调高，和声稍微跑调就立刻被拉回来，调低更宽松。听感不对再微调。",
  PitchFixMixLevel: "修过的声音和原声怎么掺：越大修音味越重，越小越接近你原本的嗓音。想自然就调小一点。",
  PitchFixMidiControlOnf: "打开后能用 MIDI 键盘（外接电子琴）实时改变和声效果。没接 MIDI 设备就不用开。",
  PitchFixMidiControlMode: "MIDI 控制的工作模式切换：一种是改设置，一种是实时控制。不接 MIDI 设备就保持默认。",
  PitchFixMidiNoteLimitLow: "MIDI 音符的下限：比它低的音符不起作用（0 是最低档）。不用 MIDI 就保持默认。",
  PitchFixMidiNoteLimitHigh: "MIDI 音符的上限：比它高的音符不起作用（127 是最高档）。不用 MIDI 就保持默认。",
  PitchFixCorrectKey: "告诉修音器歌曲的主音是什么（C＝0 到 B＝11），配合音阶决定往哪些音上修。不懂乐理保持默认。",
  PitchFixCorrectScale: "选歌曲用的音阶（大调、小调、五声音阶这些），修音器只把音往这个音阶的音上拉。不懂乐理保持默认。",
  PitchFixCorrectMode: "修音模式的切换开关，两种模式的具体差别官方没公开。拿不准就保持默认。",
  PitchFixCorrectC: "是否修正 C 这个音（Do）。关闭后，唱到 C 时不会被自动拉回调上。",
  PitchFixCorrectCs: "是否修正 C#（升 Do，右边的黑键）。关闭后 C# 保持原样不修。",
  PitchFixCorrectD: "是否修正 D 这个音（Re）。关闭后唱到 D 不会被拉回调上。",
  PitchFixCorrectDs: "是否修正 D#（升 Re 的黑键）。关闭后 D# 保持原样不修。",
  PitchFixCorrectE: "是否修正 E 这个音（Mi）。关闭后唱到 E 不会被拉回调上。",
  PitchFixCorrectF: "是否修正 F 这个音（Fa）。关闭后唱到 F 不会被拉回调上。",
  PitchFixCorrectFs: "是否修正 F#（升 Fa 的黑键）。关闭后 F# 保持原样不修。",
  PitchFixCorrectG: "是否修正 G 这个音（Sol）。关闭后唱到 G 不会被拉回调上。",
  PitchFixCorrectGs: "是否修正 G#（升 Sol 的黑键）。关闭后 G# 保持原样不修。",
  PitchFixCorrectA: "是否修正 A 这个音（La）。关闭后唱到 A 不会被拉回调上。",
  PitchFixCorrectAs: "是否修正 A#（升 La 的黑键）。关闭后 A# 保持原样不修。",
  PitchFixCorrectB: "是否修正 B 这个音（Si）。关闭后唱到 B 不会被拉回调上。",
  PitchFixCorrectRate: "修音的力度和速度：越大修得越快越狠，越小动作越轻、越自然。想保留点人味就别拉满。",
  PitchFixCorrectSense: "跑调检测的灵敏度：越高，一点偏差就判为跑调去修，太低可能漏修。修过头或漏修时用它微调。",
  PitchFixCorrectOnf: "自动修音部分的开关。打开就把跑调的音拉回调上，关闭则不修音，只保留移调、和声这些功能。",
  PitchFixTransposeMode: "移调方式的切换开关，官方没公开具体差别。保持默认即可。",

  // routing / system
  PatchAuxPhoneOutput: "决定耳机里听哪路声音：选 Mix 1 听 Mix1 混音，选 HEADPHONES 听耳机专用的监听混音。",
  PatchLoopbackMode: "把声卡里的混音再转一份回给电脑，直播、录屏软件才能录到麦克风和伴奏。选“关闭”就完全不回传。",
  PatchMonoSw: "打开后总输出的左右两边合并成一个，两边听到的内容一样。排查左右声道问题时才开，平时关着。",
  PatchInputDawMix: "监听里麦克风声和电脑播放声的比例，往哪边调就多听哪边，0 是两边均衡。拿不准就保持 0。",
  PatchRecnShareLoopOnf: "让回环信号和录音通道共用同一条路的兼容开关。平时保持默认，回环录出来不对劲再试切换。",
  PatchDawMeter: "选 DAW 电平表显示哪一路的音量。只是换个显示对象，不影响任何声音。",
  PatchMasterMeter: "选主输出电平表显示哪一路的音量。只是换个显示，不改变听到的声音。",
  PatchFxSend: "选哪一路混音的效果发送真正接到混响上。一般不用动，改错了有的通道混响会失效。",
  SysFsCode: "声卡的音质档位（44.1 到 192 kHz）。改了之后正在用声卡的软件要跟着改，否则可能没声音或变调。",
  SysRecnShareMode: "录音通道共享方式的兼容开关。平时保持默认，录音行为不对劲时再试切换。",
  SysUsbChOrder: "交换 USB 音频通道的左右顺序。发现左右反了（偏左的声音从右边出），打开它就能正过来。",

};

function tipEl(name) {
  const t = PARAM_TIPS[name];
  if (!t) return null;
  const s = document.createElement("span");
  s.className = "tip";
  s.textContent = "?";
  s.dataset.tip = t;
  // NOTE: no `title` here — the CSS ::after(data-tip) IS the tooltip.
  // Setting title as well makes WebView2 render a second, native tooltip
  // on top of the UI one (two layers).
  return s;
}

function levelToDb(v) {
  if (v <= 0) return "-INF";
  const db = v <= 103 ? -74 + (v - 1) * (74 / 102) : (v - 103) * (6 / 24);
  return (db >= 0 ? "+" : "") + db.toFixed(1);
}
function panLabel(v) { return v === 0 ? "C" : v < 0 ? `L${-v}` : `R${v}`; }

async function getParam(id, ch) { return await invoke("get_param", { paramId: id, ch }); }
async function setParam(id, ch, value) { return await invoke("set_param", { paramId: id, ch, value }); }

function toast(msg) {
  let el = document.querySelector("#toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 3000);
}
function logLine(s) {
  const pre = document.querySelector("#raw-log");
  pre.textContent = (s + "\n" + pre.textContent).split("\n").slice(0, 300).join("\n");
}

// ---------- control factories ----------
function valueText(def, v) {
  if (PARAM_DISPLAYS[def.name]) return PARAM_DISPLAYS[def.name](v);
  if (/(Level|FxBusLevel)$/.test(def.name) && def.max === 0x7f) return levelToDb(v);
  if (/Pan|Bal/.test(def.name)) return panLabel(v);
  if (def.name === "ChHpfFreq") return (["40", "60", "80", "100", "120"][v] || v) + " Hz";
  return String(v);
}

function makeToggle(name, ch, labels) {
  const def = defs[name];
  if (!def) return null;
  const btn = document.createElement("button");
  btn.className = "toggle";
  btn.textContent = labels || labelOf(name);
  btn.dataset.param = name;
  if (PARAM_TIPS[name]) btn.title = PARAM_TIPS[name];
  let dead = false;
  const entry = { id: def.id, ch, cur: null, apply: null, markDead: null };
  btn.addEventListener("click", async () => {
    if (dead) return;
    const next = btn.classList.contains("active") ? 0 : 1;
    try { await setParam(def.id, ch, next); entry.cur = next; btn.classList.toggle("active", next === 1); }
    catch (e) { toast(String(e)); }
  });
  entry.apply = v => { entry.cur = v; btn.classList.toggle("active", v === 1); btn.classList.remove("dead"); };
  entry.markDead = () => { dead = true; btn.classList.add("dead"); btn.disabled = true; btn.title = "设备无此参数"; };
  ALL_CONTROLS.push(entry);
  return btn;
}

function makeSlider(name, ch, opts = {}) {
  const def = defs[name];
  if (!def) return null;
  const wrap = document.createElement("div");
  wrap.className = "ctl";
  wrap.dataset.param = name;
  const lab = document.createElement("div");
  lab.className = "ctl-label";
  lab.textContent = labelOf(name);
  const tip = tipEl(name);
  if (tip) lab.appendChild(tip);
  const val = document.createElement("div");
  val.className = "ctl-value";
  const range = document.createElement("input");
  range.type = "range";
  range.className = opts.vertical ? "vslider" : "hslider";
  // opts.honMin: use the real def.min as slider floor (editors need raw 1.., 64.., -1200..;
  // default keeps the legacy 0-floor so existing pages behave unchanged)
  range.min = opts.honMin ? def.min : (def.min < 0 ? def.min : 0);
  range.max = def.max;
  range.step = 1;
  const syncFill = () => { if (opts.vertical) range.style.setProperty("--fill", String((range.value - range.min) / (range.max - range.min))); };
  syncFill();   // 创建后同步一次,设备回值前填充就有正确初值(仅 .vslider 消费 --fill,hslider 无观感变化)
  let t = null;
  let dead = false;
  const entry = { id: def.id, ch, cur: null, apply: null, markDead: null };
  range.addEventListener("input", () => {
    const v = parseInt(range.value, 10);
    val.textContent = valueText(def, v);
    entry.cur = v;
    syncFill();
    clearTimeout(t);
    t = setTimeout(() => setParam(def.id, ch, v).catch(e => toast(String(e))), 40);
  });
  wrap.appendChild(lab);
  wrap.appendChild(range);
  wrap.appendChild(val);
  entry.apply = v => { entry.cur = v; range.value = v; syncFill(); val.textContent = valueText(def, v); wrap.classList.remove("dead"); };
  entry.markDead = () => { dead = true; wrap.classList.add("dead"); range.disabled = true; wrap.title = "设备无此参数"; };
  ALL_CONTROLS.push(entry);
  return wrap;
}

function makeSelect(name, ch, labels, opts = {}) {
  const def = defs[name];
  if (!def) return null;
  const wrap = document.createElement("div");
  wrap.className = "ctl";
  wrap.dataset.param = name;
  const lab = document.createElement("div");
  lab.className = "ctl-label";
  lab.textContent = labelOf(name);
  const tipS = tipEl(name);
  if (tipS) lab.appendChild(tipS);
  const sel = document.createElement("select");
  // opts.honMin: build options from def.min up (labels index by raw-def.min);
  // default keeps the legacy from-0 loop
  const lo = opts.honMin ? def.min : 0;
  const n = Math.min(def.max, lo + (labels ? labels.length - 1 : def.max - lo));
  for (let i = lo; i <= n; i++) {
    const o = document.createElement("option");
    o.value = i;
    o.textContent = labels ? labels[i - lo] ?? `值 ${i}` : `${i}`;
    sel.appendChild(o);
  }
  sel.addEventListener("change", async () => {
    try { await setParam(def.id, ch, parseInt(sel.value, 10)); entry.cur = parseInt(sel.value, 10); }
    catch (e) { toast(String(e)); }
  });
  wrap.appendChild(lab);
  wrap.appendChild(sel);
  let dead = false;
  const entry = { id: def.id, ch, cur: null, apply: null, markDead: null };
  entry.apply = v => { entry.cur = v; sel.value = v; wrap.classList.remove("dead"); };
  entry.markDead = () => { dead = true; wrap.classList.add("dead"); sel.disabled = true; wrap.title = "设备无此参数"; };
  ALL_CONTROLS.push(entry);
  return wrap;
}

// ---------- mixer tab ----------
function channelStrip(idx, title, with48v) {
  const ch = idx;
  const strip = document.createElement("div");
  strip.className = "strip";
  strip.innerHTML = `<h3>${title}</h3>`;
  const toggles = document.createElement("div");
  toggles.className = "toggles";
  if (with48v) { const b = makeToggle("HaP48VOnf", 0, "48V"); if (b) { b.classList.add("danger"); toggles.appendChild(b); } }
  { const b = makeToggle("ChPhaseOnf", ch); if (b) toggles.appendChild(b); }
  { const b = makeToggle("ChHpfOnf", ch); if (b) toggles.appendChild(b); }
  strip.appendChild(toggles);
  { const s = makeSelect("ChHpfFreq", ch, ["40 Hz", "60 Hz", "80 Hz", "100 Hz", "120 Hz"]); if (s) strip.appendChild(s); }

  // FX insert slots (per channel, like the official app's "No Effect" dropdowns)
  const slotSec = document.createElement("div");
  slotSec.className = "section";
  slotSec.innerHTML = `<div class="sec-label">FX 插入槽</div>`;
  for (const slot of ["1", "2"]) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:5px;justify-content:center;align-items:flex-end;";
    const s = makeSelect(`ChFxInsType${slot}`, ch, SLOTTYPE_LABELS);
    if (s) { s.style.minWidth = "0"; s.querySelector("select").style.width = "86px"; row.appendChild(s); }
    const t = makeToggle(`ChFxInsOnf${slot}`, ch, "开");
    if (t) row.appendChild(t);
    const ed = document.createElement("button");
    ed.className = "toggle";
    ed.textContent = "编辑";
    ed.title = "打开效果器编辑窗口";
    ed.addEventListener("click", () => invoke("open_fx_editor", { ch, slot: parseInt(slot, 10) - 1 }).catch(e => toast(String(e))));
    row.appendChild(ed);
    slotSec.appendChild(row);
  }
  strip.appendChild(slotSec);

  for (const bus of ["1", "2"]) {
    const sec = document.createElement("div");
    sec.className = "section";
    sec.innerHTML = `<div class="sec-label">→ Mix${bus}</div>`;
    const row = document.createElement("div");
    row.className = "fader-row";
    row.appendChild(bus === "1" ? makeStripMeter(ch === 0 ? "in1" : "in2") : makeStripMeterGhost());
    const f = makeSlider(`ChSendMixBus${bus}Level`, ch, { vertical: true });
    if (f) row.appendChild(f);
    sec.appendChild(row);
    const p = makeSlider(`ChSendMixBus${bus}Pan`, ch, { horizontal: true });
    const prow = document.createElement("div");
    prow.className = "fader-row";
    prow.appendChild(makeAxisSpacer());
    if (p) prow.appendChild(p);
    sec.appendChild(prow);
    const ms = document.createElement("div");
    ms.className = "ms-buttons";
    const m = makeToggle(`ChSendMixBus${bus}Onf`, ch, "静音"); if (m) { m.classList.add("danger"); ms.appendChild(m); }
    const s = makeToggle(`ChSendMixBus${bus}SoloOnf`, ch, "独奏"); if (s) ms.appendChild(s);
    sec.appendChild(ms);
    strip.appendChild(sec);
  }
  return strip;
}

function dawStrip(idx, title) {
  const ch = idx;
  const strip = document.createElement("div");
  strip.className = "strip";
  strip.innerHTML = `<h3>${title}</h3>`;
  for (const bus of ["1", "2"]) {
    const sec = document.createElement("div");
    sec.className = "section";
    sec.innerHTML = `<div class="sec-label">→ Mix${bus}</div>`;
    const row = document.createElement("div");
    row.className = "fader-row";
    row.appendChild(bus === "1" ? makeStripMeter(ch === 0 ? "daw1" : "daw2") : makeStripMeterGhost());
    const f = makeSlider(`DawSendMixBus${bus}Level`, ch, { vertical: true });
    if (f) row.appendChild(f);
    sec.appendChild(row);
    const b = makeSlider(`DawSendMixBus${bus}Bal`, ch, { horizontal: true });
    const brow = document.createElement("div");
    brow.className = "fader-row";
    brow.appendChild(makeAxisSpacer());
    if (b) brow.appendChild(b);
    sec.appendChild(brow);
    const ms = document.createElement("div");
    ms.className = "ms-buttons";
    const m = makeToggle(`DawSendMixBus${bus}Onf`, ch, "M"); if (m) { m.classList.add("danger"); ms.appendChild(m); }
    sec.appendChild(ms);
    strip.appendChild(sec);
  }
  return strip;
}

function monitorStrip() {
  const strip = document.createElement("div");
  strip.className = "strip";
  strip.innerHTML = `<h3>监听 耳机</h3>`;
  const mrow = document.createElement("div");
  mrow.className = "fader-row";
  mrow.appendChild(makeStripMeter("hp"));
  mrow.appendChild(makeStripMeter("hp2"));
  strip.appendChild(mrow);
  const s = makeSelect("PatchAuxPhoneOutput", 0, ["Mix 1", "HEADPHONES"]);
  if (s) strip.appendChild(s);
  const srcSec = document.createElement("div");
  srcSec.className = "section";
  srcSec.innerHTML = `<div class="sec-label">播放源 (Windows 端点)</div>`;
  const srcRow = document.createElement("div");
  srcRow.className = "fader-row";
  srcRow.appendChild(makeStripMeter("music1"));
  srcRow.appendChild(makeStripMeter("music2"));
  const vrow = document.createElement("div");
  vrow.className = "fader-row";
  vrow.appendChild(makeStripMeter("voice1"));
  vrow.appendChild(makeStripMeter("voice2"));
  srcSec.appendChild(srcRow);
  srcSec.appendChild(vrow);
  const srcLbl = document.createElement("div");
  srcLbl.className = "sec-label muted";
  srcLbl.textContent = "上对=Music 下对=Voice";
  srcSec.appendChild(srcLbl);
  strip.appendChild(srcSec);
  const note = document.createElement("div");
  note.className = "sec-label muted";
  note.textContent = "耳机音量为面板硬件旋钮;DAW/Music/Voice 是三个独立播放端点";
  strip.appendChild(note);
  return strip;
}

function masterStrip(bus) {
  const strip = document.createElement("div");
  strip.className = "strip";
  strip.innerHTML = `<h3>Mix${bus} 主控</h3>`;
  const sec = document.createElement("div");
  sec.className = "section";
  const row = document.createElement("div");
  row.className = "fader-row";
  row.appendChild(makeStripMeter(bus === "1" ? "mix1" : "mix2"));
  const f = makeSlider(`MasterMixBus${bus}Level`, 0, { vertical: true });
  if (f) row.appendChild(f);
  sec.appendChild(row);
  const b = makeSlider(`MasterMixBus${bus}Bal`, 0, { horizontal: true });
  const brow = document.createElement("div");
  brow.className = "fader-row";
  brow.appendChild(makeAxisSpacer());
  if (b) brow.appendChild(b);
  sec.appendChild(brow);
  const ms = document.createElement("div");
  ms.className = "ms-buttons";
  const m = makeToggle(`MasterMixBus${bus}Onf`, 0, "静音"); if (m) { m.classList.add("danger"); ms.appendChild(m); }
  sec.appendChild(ms);
  strip.appendChild(sec);
  // REV-X send (per mix bus, like the official mixer's reverb return)
  const revSec = document.createElement("div");
  revSec.className = "section";
  revSec.innerHTML = `<div class="sec-label">REV-X 发送</div>`;
  const rrow = document.createElement("div");
  rrow.className = "fader-row";
  rrow.appendChild(makeStripMeterGhost());
  const rf = makeSlider(`FxRevMixBus${bus}Level`, 0, { vertical: true });
  if (rf) rrow.appendChild(rf);
  revSec.appendChild(rrow);
  const rms = document.createElement("div");
  rms.className = "ms-buttons";
  const rm = makeToggle(`FxRevMixBus${bus}Onf`, 0, "开"); if (rm) rms.appendChild(rm);
  revSec.appendChild(rms);
  strip.appendChild(revSec);
  return strip;
}

// ---------- recording test (per-strip audio path verification) ----------
let recDoneHook = null;   // set by recTestPanel; called when the backend finishes a recording
const REC_SOURCES = [
  { kind: "input", label: "输入 1/2 (麦克风/乐器)" },
  { kind: "streaming", label: "监听混音 (Streaming)" },
  { kind: "voice", label: "Voice 通道" },
];

function recTestPanel() {
  const strip = document.createElement("div");
  strip.className = "strip";
  strip.id = "rec-test";
  strip.innerHTML = `<h3>录音测试</h3>`;
  const s1 = document.createElement("select");
  s1.id = "rec-source";
  for (const s of REC_SOURCES) {
    const o = document.createElement("option");
    o.value = s.kind; o.textContent = s.label;
    s1.appendChild(o);
  }
  strip.appendChild(s1);

  // 录音电平条:绑定所选音源对应的设备电平通道,实时显示正在录制的音量
  const REC_METER_KEYS = {
    input: ["in1", "in2"],
    streaming: ["hp", "hp2"],
    voice: ["voice1", "voice2"],
  };
  const recMeterLabel = document.createElement("div");
  recMeterLabel.className = "sec-label";
  recMeterLabel.textContent = "录音电平";
  strip.appendChild(recMeterLabel);
  const recMeterRow = document.createElement("div");
  recMeterRow.className = "fader-row";
  recMeterRow.style.minHeight = "96px";
  strip.appendChild(recMeterRow);
  function rebuildRecMeters() {
    recMeterRow.innerHTML = "";
    for (const k of REC_METER_KEYS[s1.value] || []) {
      const m = makeStripMeter(k);
      m.style.height = "90px";
      m.title = "正在录制的音量(" + REC_SOURCES.find(s => s.kind === s1.value)?.label + ")";
      recMeterRow.appendChild(m);
    }
  }
  rebuildRecMeters();
  s1.addEventListener("change", rebuildRecMeters);

  const s2 = document.createElement("select");
  s2.id = "rec-sec";
  for (const n of [3, 5, 8]) {
    const o = document.createElement("option");
    o.value = n; o.textContent = `时长 ${n} 秒`;
    s2.appendChild(o);
  }
  strip.appendChild(s2);
  // 播放设备选择:默认系统当前扬声器,可切换任意输出设备
  const pdevLabel = document.createElement("div");
  pdevLabel.className = "sec-label muted";
  pdevLabel.textContent = "试放设备";
  strip.appendChild(pdevLabel);
  const pdev = document.createElement("select");
  pdev.id = "play-device";
  pdev.style.width = "100%";
  const defOpt = document.createElement("option");
  defOpt.value = ""; defOpt.textContent = "系统默认扬声器";
  pdev.appendChild(defOpt);
  invoke("list_output_devices").then(od => {
    for (const n of od.devices) {
      const o = document.createElement("option");
      o.value = n; o.textContent = n;
      pdev.appendChild(o);
    }
    // 默认选中系统当前使用的扬声器(实际设备名)
    if (od.default && od.devices.includes(od.default)) pdev.value = od.default;
    else pdev.value = "";
  }).catch(() => {});
  strip.appendChild(pdev);
  const brow = document.createElement("div");
  brow.className = "ms-buttons";
  const rec = document.createElement("button");
  rec.id = "btn-rec"; rec.textContent = "⏺ 开始录音";
  const play = document.createElement("button");
  play.id = "btn-play"; play.textContent = "▶ 试放"; play.disabled = true;
  brow.appendChild(rec); brow.appendChild(play);
  strip.appendChild(brow);
  const status = document.createElement("div");
  status.className = "sec-label muted";
  status.id = "rec-status";
  status.textContent = "选择音源后录音,验证该音轨通路是否正常";
  strip.appendChild(status);
  const devs = document.createElement("div");
  devs.className = "sec-label muted";
  devs.id = "rec-devs";
  devs.style.fontSize = "10px";
  strip.appendChild(devs);

  let recPath = null;
  let recActive = false;
  recDoneHook = function onRecDone(r) {
    recActive = false;
    rec.textContent = "⏺ 开始录音";
    recPath = r.path;
    status.textContent = `已录 ${r.seconds.toFixed(1)}s @ ${r.sampleRate}Hz/${r.channels}ch (${r.device})`;
    play.disabled = false;
    if (r.error) {
      status.textContent = "录音失败: " + r.error;
      play.disabled = true;
      toast("录音失败: " + r.error);
    }
  };
  rec.addEventListener("click", async () => {
    if (rec.disabled) return;
    const kind = s1.value;
    const secs = parseInt(s2.value, 10);
    if (!recActive) {
      rec.disabled = true; play.disabled = true;
      try {
        await invoke("record_start", { kind, maxSeconds: secs });
        recActive = true;
        rec.disabled = false;
        rec.textContent = "⏹ 停止录音";
        status.textContent = `录音中…(最长 ${secs}s,可随时停止)`;
      } catch (e) {
        status.textContent = "启动失败: " + e;
        rec.disabled = false;
        toast(String(e));
      }
    } else {
      rec.disabled = true;
      try {
        const r = await invoke("record_stop");
        recDoneHook(r);
        logLine(`录音文件: ${r.path}`);
      } catch (e) {
        recActive = false;
        rec.textContent = "⏺ 开始录音";
        status.textContent = "停止失败: " + e;
        toast(String(e));
      }
      rec.disabled = false;
    }
  });
  play.addEventListener("click", async () => {
    if (!recPath || play.disabled) return;
    play.disabled = true;
    status.textContent = "播放中…(" + (pdev.value || "系统默认扬声器") + ")";
    try {
      const r = await invoke("play_wav", { path: recPath, device: pdev.value || null });
      status.textContent = `播放完成 (${r.duration_s.toFixed(1)}s via ${r.device})`;
    } catch (e) {
      status.textContent = "播放失败: " + e;
    }
    play.disabled = false;
  });
  return strip;
}

// ---------- FX tab ----------
function fxPanel(group) {
  const panel = document.createElement("div");
  panel.className = "strip fx-panel";
  panel.innerHTML = `<h3>${group.title}</h3>`;
  const names = Object.keys(defs).filter(group.match);
  if (!names.length) { panel.innerHTML += `<div class="sec-label muted">无此族参数</div>`; return panel; }
  if (group.ch === "per") {
    for (const ch of [0, 1]) {
      const sub = document.createElement("div");
      sub.className = "fx-sub";
      sub.innerHTML = `<div class="sec-label">输入 ${ch + 1}</div>`;
      const grid = document.createElement("div");
      grid.className = "fx-grid";
      for (const n of names) {
        const def = defs[n];
        if (def.max <= 1) { const c = makeToggle(n, ch); if (c) grid.appendChild(c); }
        else if (n === "ChFxInsType") { const c = makeSelect(n, ch, SLOTTYPE_LABELS); if (c) grid.appendChild(c); }
        else if (def.max <= 6) { const c = makeSelect(n, ch); if (c) grid.appendChild(c); }
        else { const c = makeSlider(n, ch); if (c) grid.appendChild(c); }
      }
      sub.appendChild(grid);
      panel.appendChild(sub);
    }
  } else {
    const grid = document.createElement("div");
    grid.className = "fx-grid";
    for (const n of names) {
      const def = defs[n];
      if (def.max <= 1) { const c = makeToggle(n, group.ch); if (c) grid.appendChild(c); }
      else if (def.max <= 6) {
        let labels = null;
        if (n === "FxRevType") labels = REVTYPE_LABELS;
        if (n === "GtrFxType") labels = GTRTYPE_LABELS;
        const c = makeSelect(n, group.ch, labels); if (c) grid.appendChild(c);
      } else { const c = makeSlider(n, group.ch); if (c) grid.appendChild(c); }
    }
    panel.appendChild(grid);
    // REV-X 组追加「编辑」按钮:打开独立 REV-X 编辑窗(fx-0-7,与通道条「编辑」同款样式)
    if (/REV-X/.test(group.title)) {
      const edrow = document.createElement("div");
      edrow.className = "ms-buttons";
      const ed = document.createElement("button");
      ed.className = "toggle";
      ed.textContent = "编辑";
      ed.title = "打开 REV-X 编辑窗口";
      ed.addEventListener("click", () => invoke("open_fx_editor", { ch: 0, slot: 7 }).catch(e => toast(String(e))));
      edrow.appendChild(ed);
      panel.appendChild(edrow);
    }
  }
  return panel;
}

// ---------- routing tab ----------
function routingPanel() {
  const panel = document.createElement("div");
  panel.className = "strip fx-panel";
  panel.innerHTML = `<h3>路由 / 系统</h3>`;
  const grid = document.createElement("div");
  grid.className = "fx-grid";
  for (const n of ROUTE_LIST) {
    const def = defs[n];
    if (!def) continue;
    if (n === "SysFsCode") { const c = makeSelect(n, 0, FS_LABELS); if (c) grid.appendChild(c); }
    else if (n === "PatchLoopbackMode") { const c = makeSelect(n, 0, LOOPBACK_LABELS); if (c) grid.appendChild(c); }
    else if (n === "PatchAuxPhoneOutput") { const c = makeSelect(n, 0, ["Mix 1", "HEADPHONES"]); if (c) grid.appendChild(c); }
    else if (def.max <= 1) { const c = makeToggle(n, 0); if (c) grid.appendChild(c); }
    else if (def.max <= 6) { const c = makeSelect(n, 0); if (c) grid.appendChild(c); }
    else { const c = makeSlider(n, 0); if (c) grid.appendChild(c); }
  }
  panel.appendChild(grid);
  const note = document.createElement("div");
  note.className = "sec-label muted";
  note.textContent = "灰色控件 = 设备无此参数(型号差异);回环模式与采样率会真实改变设备状态";
  panel.appendChild(note);
  return panel;
}

// meter channel mapping — AUTHORITATIVE (RE'd from MemAPI FUN_180005940 offset tiling + dspMixFx YQMeterID:
// INPUTPORT=0 PLAYBACKPORT=1 MIXBUS=2; urcontrol Lua independently names entry 10 "Mix1 Master L")
// in1/in2 = meter_inpt ch0/1 · daw1/2 = meter_pb ch0/1 · mix1 L/R = 10/11, mix2 L/R = 12/13 ·
// 监听 = streamingbus 52/53 (音乐回放返回路径); GR 域: -65=0dB GR, dB = (v-8191)/102.4
const METER_MAP = {
  in1: 0, in2: 1, daw1: 6, daw2: 7, mix1: 10, mix2: 12, hp: 52, hp2: 53,
  music1: 54, music2: 55, voice1: 56, voice2: 57,
};
const METER_FLOOR = 1398;   // level-silence floor
const METER_MAX = 8191;     // 0 dBFS
const METER_BANKS = {
  comp_gr: [14, 19], eq: [20, 25], gfx_in: [26, 27], gfx_out: [28, 29],
  revx_rtn: [30, 31], revx_snd: [32, 33], ssmcs: [34, 39], sc_in: [40, 45],
  sc_out: [46, 51], streamingbus: [52, 53], music: [54, 55], voice: [56, 57],
};

// ---------- meters (device pushes 89 packed (cur,peak) channels) ----------
const METER_COUNT = 89;
const meterBars = [];
const stripMeterEls = {};

function makeStripMeter(key) {
  const el = document.createElement("div");
  el.className = "strip-meter";
  el.title = labelOf(key);
  const bar = document.createElement("div"); bar.className = "sm-bar";
  const peak = document.createElement("div"); peak.className = "sm-peak";
  el.appendChild(bar); el.appendChild(peak);
  if (!stripMeterEls[key]) stripMeterEls[key] = [];
  stripMeterEls[key].push({ bar, peak });
  return el;
}

// layout-only placeholder: same box model as a real meter, carries no data
function makeStripMeterGhost() {
  const el = document.createElement("div");
  el.className = "strip-meter ghost";
  return el;
}

// thin invisible slot for horizontal-slider rows (pan/bal): reserves the 10px
// meter axis slot without inflating row height like the 130px ghost would
function makeAxisSpacer() {
  const el = document.createElement("div");
  el.className = "axis-spacer";
  return el;
}

function meterValue(v) {
  return Math.max(0, Math.min(1, (v - METER_FLOOR) / (METER_MAX - METER_FLOOR)));
}

// ═══ FX 编辑器专用工具(bootEditor 用;主窗不触碰) ═══
// editor meter registry:每次整窗重绘清空,makeEdMeterPair 注册 (raw 通道, bar, peak, mode)
let edMeters = [];

function makeEdMeterPair(idxL, idxR, caption, mode = "level") {
  const box = document.createElement("div");
  box.className = "ed-meter" + (mode === "gr" ? " ed-gr" : "");
  const pair = document.createElement("div"); pair.className = "pair";
  for (const idx of [idxL, idxR]) {
    const w = document.createElement("div"); w.className = "strip-meter";
    const bar = document.createElement("div"); bar.className = "sm-bar";
    const peak = document.createElement("div"); peak.className = "sm-peak";
    w.appendChild(bar); w.appendChild(peak); pair.appendChild(w);
    edMeters.push({ idx, bar, peak, mode });
  }
  const cap = document.createElement("div"); cap.className = "cap"; cap.textContent = caption;
  box.appendChild(pair); box.appendChild(cap);
  return box;
}

function edMeterFrame(entries) {
  for (const m of edMeters) {
    const d = entries[m.idx]; if (!d) continue;
    if (m.mode === "gr") {
      // GR 域:-65 = 0 dB GR(analysis/meter_map.md 标定:GR_dB = (-65-v)/102.4),满刻度 24 dB
      const g = Math.min(24, Math.max(0, (-65 - d[0]) / 102.4));
      const gp = Math.min(24, Math.max(0, (-65 - d[1]) / 102.4));
      m.bar.style.height = (g / 24 * 100).toFixed(1) + "%";
      m.peak.style.top = (gp / 24 * 100).toFixed(1) + "%";
    } else {
      m.bar.style.height = (meterValue(d[0]) * 100).toFixed(1) + "%";
      m.peak.style.bottom = (meterValue(d[1]) * 100).toFixed(1) + "%";
    }
  }
}

function edPumpStart() {
  if (window.__edPump) return;
  window.__edPump = true;
  let poller = null;
  const startPoller = () => {
    if (poller || window.__edLive) return;
    // 降级通道:仅当 capabilities 未授权 listen 时才走。meterOnly=true 让后端
    // 只 take() LATEST_METER、绝不动 PENDING —— rec-done/device 事件是主窗的
    // 口粮,子窗整包 drain 会把它们抢走并永久丢失(主窗录音按钮卡在"停止录音"、
    // 设备插拔状态灯失灵)。150ms 节流减少与主窗 100ms 泵的电平帧互抢
    // (丢一帧无害,丢一个事件致命)。
    poller = setInterval(async () => {
      try {
        const d = await invoke("drain_events", { meterOnly: true });
        if (d && d.meter) edMeterFrame(d.meter.entries);
      } catch (e) { /* offline */ }
    }, 150);
  };
  try {
    // 主路径:capabilities 已给 fx-* 窗口授予 core:default(core:event:default
    // 含 allow-listen),后端 app.emit("urc", …) 全窗口广播。Tauri v2 的回调
    // 参数是 { event, id, payload } 信封,数据在 pkg.payload 里;主窗走 pull
    // 模式不经此通道,不受影响。
    Promise.resolve(listen("urc", pkg => {
      const p = (pkg && typeof pkg === "object" && "payload" in pkg) ? pkg.payload : pkg;
      if (p && p.kind === "meter") edMeterFrame(p.entries);
    })).then(un => {
      window.__edLive = true;
      if (poller) { clearInterval(poller); poller = null; }   // 广播确认可用,停掉降级泵
      window.__edUnlisten = un;
    }).catch(startPoller);
  } catch (e) { startPoller(); }
  setTimeout(() => { if (!window.__edLive) startPoller(); }, 1500);   // 拒权常表现为永不 resolve
}

// 子窗尺寸:LogicalSize 依次试 __TAURI__.window / __TAURI__.dpi(两种打包形态都见过)。
// setSize 是 core 命令,需 capability 里的 core:window:allow-set-size(已在 default.json
// 给 fx-* 授权);拒权曾表现为静默 unhandled rejection,这里显式 catch 打到 console。
function edResize(w, h) {
  try {
    const T = window.__TAURI__ || {};
    const wns = T.window || {};
    const cur = (typeof wns.getCurrentWindow === "function") ? wns.getCurrentWindow()
      : (typeof wns.getCurrent === "function") ? wns.getCurrent() : null;
    const LS = wns.LogicalSize || (T.dpi && T.dpi.LogicalSize);
    if (cur && LS) Promise.resolve(cur.setSize(new LS(w, h))).catch(e => console.warn("edResize rejected:", e));
  } catch (e) { }
}

// 给某参数最新的 ALL_CONTROLS 条目追加 apply(设备回值时触发 canvas 重绘/联动置灰)
function chainApply(name, ch, fn) {
  const d = defs[name];
  if (!d) return;
  const e = ALL_CONTROLS.filter(c => c.id === d.id && c.ch === ch).pop();
  if (e) { const base = e.apply; e.apply = v => { base(v); fn(v); }; }
}

// 编辑器内某参数当前值:优先 ALL_CONTROLS entry 的 .cur(probeAll 后有值),回退表默认
function edCur(name, ch) {
  const d = defs[name];
  if (!d) return 0;
  const e = ALL_CONTROLS.filter(c => c.id === d.id && c.ch === ch).pop();
  return (e && e.cur != null) ? e.cur : d.default;
}

// canvas 手柄写值:找到 data-param 控件里的 input/select,赋值后 dispatch 事件 ——
// 复用工厂内部 40ms 防抖 + valueText + ALL_CONTROLS 同步,不重复实现下发逻辑
function edSetParamUI(name, ch, v) {
  const el = document.querySelector(`[data-param="${name}"]`);
  if (!el) return;
  const inp = el.tagName === "INPUT" || el.tagName === "SELECT" ? el : el.querySelector("input, select");
  if (!inp) return;
  inp.value = String(v);
  inp.dispatchEvent(new Event(inp.tagName === "SELECT" ? "change" : "input"));
}

function meterRail() {
  const strip = document.createElement("div");
  strip.className = "strip";
  strip.id = "meter-strip";
  strip.innerHTML = `<h3>电平表 (89ch)</h3>`;
  const grid = document.createElement("div");
  grid.className = "meter-grid";
  for (let i = 0; i < METER_COUNT; i++) {
    const m = document.createElement("div");
    m.className = "meter";
    const w = document.createElement("div");
    w.className = "bar-wrap";
    const bar = document.createElement("div"); bar.className = "bar";
    const peak = document.createElement("div"); peak.className = "peak";
    w.appendChild(bar); w.appendChild(peak);
    const lbl = document.createElement("span"); lbl.className = "m-label"; lbl.textContent = String(i);
    m.appendChild(w); m.appendChild(lbl);
    grid.appendChild(m);
    meterBars.push({ bar, peak, w });
  }
  strip.appendChild(grid);
  const note = document.createElement("div");
  note.className = "sec-label muted";
  note.id = "meter-note";
  note.textContent = "等待推送…(悬停看数值)";
  strip.appendChild(note);
  return strip;
}

// ---------- tabs ----------
function setupTabs() {
  document.querySelectorAll(".tab").forEach(t => {
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
      document.querySelector("#page-" + t.dataset.tab).classList.remove("hidden");
    });
  });
}

// ---------- scenes ----------
async function refreshSceneList() {
  const names = await invoke("list_scenes");
  const sel = document.querySelector("#scene-select");
  sel.innerHTML = "<option value=\"\">— 场景 —</option>";
  for (const n of names) {
    const o = document.createElement("option");
    o.value = n; o.textContent = n;
    sel.appendChild(o);
  }
}

async function sceneSave() {
  const items = ALL_CONTROLS.filter(c => c.cur != null).map(c => ({ id: c.id, ch: c.ch, v: c.cur }));
  if (!items.length) { toast("还没有任何已读状态,先刷新状态"); return; }
  const d = new Date();
  const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
  const name = `场景-${ts}`;
  await invoke("save_scene", { name, data: JSON.stringify(items) });
  await refreshSceneList();
  document.querySelector("#scene-select").value = name;
  toast(`已保存 ${items.length} 项: ${name}`);
}

async function sceneLoad() {
  const name = document.querySelector("#scene-select").value;
  if (!name) { toast("先在下拉框选择一个场景"); return; }
  const raw = await invoke("load_scene", { name });
  const items = JSON.parse(raw);
  for (const it of items) {
    try { await setParam(it.id, it.ch, it.v); } catch (e) { toast(`写 ${it.id}:${it.ch} 失败`); }
    for (const c of ALL_CONTROLS) if (c.id === it.id && c.ch === it.ch) c.apply(it.v);
    await new Promise(r => setTimeout(r, 2));
  }
  toast(`场景 ${name} 已应用 (${items.length} 项)`);
}

async function sceneInit() {
  const seen = new Set();
  for (const c of ALL_CONTROLS) {
    const def = Object.values(defs).find(d => d.id === c.id);
    if (!def) continue;
    const k = def.id + ":" + c.ch;
    if (seen.has(k)) continue;
    seen.add(k);
    try { await setParam(def.id, c.ch, def.default); } catch (e) { }
    c.apply(def.default);
    await new Promise(r => setTimeout(r, 2));
  }
  toast("已恢复参数表默认值");
}

// ---------- boot ----------
function setConnected(info) {
  const dot = document.querySelector("#status-dot");
  dot.className = info.connected ? "dot on" : "dot off";
  document.querySelector("#device-name").textContent = info.connected ? info.name : "未连接";
  document.querySelector("#device-meta").textContent = info.connected
    ? `${(info.sampleRate / 1000).toFixed(0)} kHz · ${info.inChannels} 进 ${info.outChannels} 出`
    : (info.error || "");
}

async function probeAll() {
  // single batch capability probe over every rendered control
  const queries = ALL_CONTROLS.map(c => [c.id, c.ch]);
  await setStage(`[q:${queries.length} c:${ALL_CONTROLS.length} first=${JSON.stringify(queries[0])}]`);
  const seen = new Set();
  const uniq = queries.filter(q => { const k = q.join(":"); if (seen.has(k)) return false; seen.add(k); return true; });
  let result = {};
  try { result = await invoke("query_many", { queries: uniq, windowMs: 2000 }); }
  catch (e) {
    await invoke("set_title", { title: `URC 控制台 [探测失败]` }).catch(() => {});
    toast("批量探测失败: " + e);
    return;
  }
  for (const c of ALL_CONTROLS) {
    const k = c.id + ":" + c.ch;
    if (k in result) c.apply(result[k]);
    else c.markDead();
  }
  await invoke("set_title", { title: `URC 控制台 [${Object.keys(result).length}/${uniq.length}]` }).catch(() => {});
  logLine(`探测完成: ${Object.keys(result).length}/${uniq.length} 参数有应答`);
}

async function setStage(t) { await invoke("set_title", { title: `URC ${t}` }).catch(() => {}); }

window.addEventListener("DOMContentLoaded", async () => {
  const list = await invoke("list_params");
  defs = {};
  for (const d of list) defs[d.name] = d;
  await setStage(`[defs:${list.length} sample=${JSON.stringify(defs["ChSendMixBus1Level"] || null)?.slice(0, 60)}]`);

  // FX editor popup mode: this window's label is "fx-{ch}-{slot}"
  // robust across Tauri v2 global-API shapes
  let wl = "";
  try {
    const w = window.__TAURI__ && window.__TAURI__.window;
    if (w && typeof w.getCurrentWindow === "function") { const x = w.getCurrentWindow(); if (x && x.label) wl = x.label; }
    else if (w && typeof w.getCurrent === "function") { const x = w.getCurrent(); if (x && x.label) wl = x.label; }
    const md = window.__TAURI__ && window.__TAURI__.metadata;
    if (!wl && md && md.currentWindow && md.currentWindow.label) wl = md.currentWindow.label;
    if (!wl && window.__TAURI__ && typeof window.__TAURI__.metadata === "undefined") {
      // last resort: the backend can tell us via drain? skip — leave empty (console mode)
    }
  } catch (e) { wl = ""; }
  const fxm = wl.match(/^fx-(\d+)-(\d+)$/);
  // 浏览器测试入口:?popup=fx-{ch}-{slot}(优先级低于 window label)
  const pq = !fxm ? (new URLSearchParams(location.search).get("popup") || "").match(/^fx-(\d+)-(\d+)$/) : null;
  if (fxm || pq) {
    const m = fxm || pq;
    try { await bootEditor(parseInt(m[1]), parseInt(m[2])); }
    catch (e) {
      const st = window.__edStep || "?";
      const loc = ((e && e.stack) || "").match(/app\.js:\d+:\d+/);
      setTimeout(() => invoke("set_title", { title: `URC [err @${st} ${loc ? loc[0] : ""}: ${e}]` }).catch(() => {}), 3500);
    }
    return;
  }
  try { await normalBoot(list); }
  catch (e) { await invoke("set_title", { title: `URC [boot err: ${e}]` }).catch(() => {}); }
});

// per-slot FX editor popup (child window; shares the backend via invoke).
// 布局规格 v1:参考官方 dspMixFx UR-C 编辑器(KnobController/FaderController/
// MeterController/RoundMeterController 框架 → 旋钮+电平表+圆形 GR 表;曲线图在上,
// 参数在下;分区、型号感知、旁通联动置灰)
async function bootEditor(ch, slot) {
  window.__edStep = "hide-chrome";
  // 编辑器子窗只留内容区: 主窗口的导航/状态栏、标签条、电平表栏、日志区全部隐藏
  for (const sel of ["header", "#tabbar", "#meter-rail", "#raw-log-wrap"]) {
    const el = document.querySelector(sel);
    if (el) el.style.display = "none";
  }
  window.__edStep = "prep-page";
  const page = document.querySelector("#page-mix");
  page.classList.remove("hidden");
  page.innerHTML = "";

  // 编辑器电平表数据泵(0.2 节):广播优先,编辑子窗可能无 event capability → 降级 drain
  edPumpStart();

  // 硬约束禁显 + 官方不露的参数绝不进编辑器(UserParam*/Hid*/FxStereoLinkInfo 等)
  const ED_HIDDEN = n => /UserParam/.test(n) || /Hid/.test(n) || n === "FxStereoLinkInfo";
  // 兜底渲染(未标定类型)用的族正则
  const famByType = {
    1: [/^(FxComp|FxEq|FxMorphValue|FxStereoLink)/],
    2: [/^GtrFx/],
    3: [/^FxComp/],
    5: [/^PitchFix/],
    8: [/^FxRev/],
  };
  let lastType = -1;
  let lastSub = -1;          // GA 型号(GtrFxType)/ REV-X 变体(FxRevType),render() 每轮重查
  let rerenderQueued = false;

  // 型号切换(编辑窗内下拉)即时重绘 + 2.5s 轮询兜底共用
  function scheduleRerender() {
    if (rerenderQueued) return;
    rerenderQueued = true;
    setTimeout(async () => { rerenderQueued = false; try { await render(); } catch (e) { } }, 30);
  }

  // ---- 小型构建工具(编辑器专用) ----
  function edRoot() { const r = document.createElement("div"); r.className = "ed-root"; return r; }
  function edHeader(title, model) {
    const h = document.createElement("div"); h.className = "ed-header";
    const t = document.createElement("div"); t.className = "ed-title"; t.textContent = title; h.appendChild(t);
    if (model) { const m = document.createElement("div"); m.className = "ed-model"; m.textContent = model; h.appendChild(m); }
    return h;
  }
  function edMetersBox(...pairs) {
    const box = document.createElement("div"); box.className = "ed-meters";
    for (const p of pairs) if (p) box.appendChild(p);
    return box;
  }
  function edCol(title) {
    const col = document.createElement("div");
    col.className = "ed-col";
    if (title) col.innerHTML = `<div class="ed-col-title">${title}</div>`;
    return col;
  }
  function edSec(name) {
    const s = document.createElement("div");
    s.className = "ed-sec";
    s.innerHTML = `<div class="sec-label">${name}</div>`;
    return s;
  }
  function edNote(text) { const d = document.createElement("div"); d.className = "ed-hint"; d.textContent = text; return d; }
  function edFlow() { const d = document.createElement("div"); d.style.cssText = "display:flex;flex-direction:column;gap:6px;min-width:0;"; return d; }
  function ctlInput(ctl) { return ctl ? ctl.querySelector("input, select") : null; }
  // 工厂 click 处理器是 async 的:本监听同步先跑,读到的 active 还是旧值 → 预测取反。
  // 设备回值后 chainApply 会再校准一次。
  function onTogglePredict(btn, fn) { if (btn) btn.addEventListener("click", () => fn(!btn.classList.contains("active"))); }
  function onCtlInput(ctl, evt, fn) { const inp = ctlInput(ctl); if (inp) inp.addEventListener(evt, fn); }

  async function render() {
    // slot===7 的窗口(fx-{ch}-7)是 REV-X 独立编辑窗入口(ChFxInsType max=6 永远到不了 8,故强制)
    let t;
    if (slot === 7) {
      t = 8;
    } else {
      const td = defs["ChFxInsType" + (slot + 1)];
      t = 0;
      try { if (td) t = await getParam(td.id, ch); } catch (e) { }
    }
    // GA/REV-X 另查 GtrFxType/FxRevType:型号或变体变化 → 整窗重绘(2.5s 轮询兜底)
    if (slot === 7) {
      let rt = -1;
      try { rt = await getParam(defs["FxRevType"].id, 0); } catch (e) { }
      if (t === lastType && rt === lastSub) return;
      lastSub = rt;
    } else if (t >= 2 && t <= 5) {
      let m = -1;
      try { m = await getParam(defs["GtrFxType"].id, ch); } catch (e) { }
      if (t === lastType && m === lastSub) return;
      lastSub = m;
    } else if (t === lastType) {
      return;
    }
    lastType = t;
    const typeName = SLOTTYPE_LABELS[t] || `类型 ${t}`;
    const titleName = SLOT_TITLE[t] || typeName;
    await invoke("set_title", { title: `Channel ${ch + 1} Slot ${slot + 1} ${titleName}` }).catch(() => { });
    // 整窗重绘前清空:旧 ALL_CONTROLS 条目不清理会残留在 probeAll 队列(0.3 节)
    ALL_CONTROLS.length = 0;
    edMeters.length = 0;
    page.innerHTML = "";
    if (t === 1) await renderSSM(ch, page);
    else if (t >= 2 && t <= 5) await renderGA(ch, page);
    else if (t === 6) await renderPitchFix(ch, page);
    else if (t === 8) await renderRevX(ch, page);
    else if (t === 0) renderNone(page);           // 兜底 A
    else renderUnknown(t, page);                  // 兜底 B(通用平铺保留)
    if (ALL_CONTROLS.length) await probeAll();
    await invoke("set_title", { title: `效果器 ${ch + 1}-${slot + 1}: ${titleName} [${ALL_CONTROLS.length} 参数]` }).catch(() => { });
  }

  // SSM(ChFxInsType=1)— 官方三列布局 COMP|EQ|MORPH + 表轨(规格 1 节)
  async function renderSSM(ch, page) {
    const add = (parent, ctl) => { if (ctl) parent.appendChild(ctl); return ctl; };
    edResize(1014, 640);   // 官方内容 1014x572,留出边框与页边
    const root = edRoot();
    const header = edHeader(`SWEET SPOT MORPHING CHANNEL STRIP · 输入 ${ch + 1}`);
    header.appendChild(edMetersBox(
      makeEdMeterPair(34 + 2 * ch, 35 + 2 * ch, "IN"),    // ssmcs:编辑器通道 L/R(高置信)
      makeEdMeterPair(46 + 2 * ch, 47 + 2 * ch, "OUT"),   // sc_out(中置信)
    ));
    root.appendChild(header);

    const cols = document.createElement("div"); cols.className = "ed-cols";

    // ---- COMP 列 ----
    const comp = edCol("COMP");
    const compBy = add(comp, makeToggle("FxCompBypass", ch, "压缩旁通"));
    const grRow = document.createElement("div"); grRow.className = "ed-meter-row";
    grRow.appendChild(makeEdMeterPair(14 + 2 * ch, 15 + 2 * ch, "GR", "gr"));   // comp_gr:顶端向下=削减量,满刻度 24 dB
    comp.appendChild(grRow);
    const compBody = edFlow();
    add(compBody, makeSlider("FxCompDrive", ch, { horizontal: true }));
    add(compBody, makeSlider("FxCompAttack", ch, { horizontal: true }));
    add(compBody, makeSlider("FxCompRelease", ch, { horizontal: true }));
    add(compBody, makeSlider("FxCompRatio", ch, { horizontal: true }));
    add(compBody, makeSelect("FxCompKnee", ch, ["SOFT", "MEDIUM", "HARD"]));
    const sc = edSec("SIDE CHAIN");
    const scFlex = document.createElement("div"); scFlex.style.cssText = "display:flex;gap:8px;align-items:stretch;";
    const scCtl = edFlow(); scCtl.style.flex = "1 1 auto";
    add(scCtl, makeToggle("FxCompScOnf", ch, "侧链启用"));
    add(scCtl, makeSlider("FxCompScFreq", ch, { horizontal: true }));
    add(scCtl, makeSlider("FxCompScGain", ch, { horizontal: true }));
    add(scCtl, makeSlider("FxCompScQual", ch, { horizontal: true }));
    scFlex.appendChild(scCtl);
    const scRow = document.createElement("div"); scRow.className = "ed-meter-row";
    scRow.appendChild(makeEdMeterPair(40 + 2 * ch, 41 + 2 * ch, "SC"));          // sc_in(中置信;实测无动态则与 OUT 对调)
    scFlex.appendChild(scRow);
    sc.appendChild(scFlex);
    compBody.appendChild(sc);
    comp.appendChild(compBody);
    cols.appendChild(comp);
    // 旁通联动:.ed-dim 只降透明度(DLL 证实旁通时官方旋钮 opacity 0.3)
    chainApply("FxCompBypass", ch, v => compBody.classList.toggle("ed-dim", v === 1));
    onTogglePredict(compBy, v => compBody.classList.toggle("ed-dim", v));

    // ---- EQ 列:canvas 响应曲线 + LOW/MID/HIGH ----
    const eq = edCol("EQ");
    const cvBox = document.createElement("div"); cvBox.className = "ed-canvas-box";
    const cv = document.createElement("canvas");
    cvBox.appendChild(cv);
    eq.appendChild(cvBox);
    const eqBody = edFlow();
    const low = edSec("LOW");
    const lowOn = add(low, makeToggle("FxEqLsvOnf", ch, "启用"));
    const lowF = add(low, makeSlider("FxEqLsvFreq", ch, { horizontal: true }));
    const lowG = add(low, makeSlider("FxEqLsvGain", ch, { horizontal: true }));
    eqBody.appendChild(low);
    const mid = edSec("MID");
    const midOn = add(mid, makeToggle("FxEqMidOnf", ch, "启用"));
    const midF = add(mid, makeSlider("FxEqMidFreq", ch, { horizontal: true }));
    const midG = add(mid, makeSlider("FxEqMidGain", ch, { horizontal: true }));
    const midQ = add(mid, makeSlider("FxEqMidQual", ch, { horizontal: true }));
    eqBody.appendChild(mid);
    const high = edSec("HIGH");
    const highOn = add(high, makeToggle("FxEqHsvOnf", ch, "启用"));
    const highF = add(high, makeSlider("FxEqHsvFreq", ch, { horizontal: true }));
    const highG = add(high, makeSlider("FxEqHsvGain", ch, { horizontal: true }));
    eqBody.appendChild(high);
    eq.appendChild(eqBody);
    // 官方 EQ On/Off 在 EQ 列末
    const eqBy = add(eq, makeToggle("FxEqBypass", ch, "EQ 旁通"));
    cols.appendChild(eq);

    // ---- EQ 曲线绘制(RBJ cookbook,Fs=48000 仅作显示归一,不参与写值) ----
    // 画布宽随 EQ 列容器自适应(280..480),高固定 220
    let EQW = 460;
    const EQH = 220, ML = 36, MR = 10, MT = 8, MB = 18;
    const F_MIN = 20, F_MAX = 20000, DB_MAX = 18, Fs = 48000;
    const eqX = f => ML + (Math.log10(f) - Math.log10(F_MIN)) / (Math.log10(F_MAX) - Math.log10(F_MIN)) * (EQW - ML - MR);
    const eqY = db => MT + (DB_MAX - db) / (2 * DB_MAX) * (EQH - MT - MB);
    const dpr = window.devicePixelRatio || 1;
    cv.width = EQW * dpr; cv.height = EQH * dpr;
    cv.style.width = EQW + "px"; cv.style.height = EQH + "px";
    const bands = [
      { freq: "FxEqLsvFreq", gain: "FxEqLsvGain", onf: "FxEqLsvOnf", color: "#4cc38a", kind: "low" },
      { freq: "FxEqMidFreq", gain: "FxEqMidGain", onf: "FxEqMidOnf", color: "#f0aa28", kind: "peak" },
      { freq: "FxEqHsvFreq", gain: "FxEqHsvGain", onf: "FxEqHsvOnf", color: "#58a6ff", kind: "high" },
    ];
    // low/high shelf(shelfSlope S=1)与 peak 的 b/a 系数,cookbook 公式写死
    function shelfC(f0, g, high) {
      const A = Math.pow(10, g / 40), w = 2 * Math.PI * f0 / Fs;
      const cw = Math.cos(w), sw = Math.sin(w);
      const aa = 2 * Math.sqrt(A) * (sw / 2 * Math.SQRT2);   // alpha=sin/2*sqrt((A+1/A)*(1/S-1)+2), S=1
      return high
        ? [A * ((A + 1) + (A - 1) * cw + aa), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - aa),
           (A + 1) - (A - 1) * cw + aa, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - aa]
        : [A * ((A + 1) - (A - 1) * cw + aa), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - aa),
           (A + 1) + (A - 1) * cw + aa, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - aa];
    }
    function peakC(f0, g, Q) {
      const A = Math.pow(10, g / 40), w = 2 * Math.PI * f0 / Fs;
      const cw = Math.cos(w), al = Math.sin(w) / (2 * Q);
      return [1 + al * A, -2 * cw, 1 - al * A, 1 + al / A, -2 * cw, 1 - al / A];
    }
    function magDb(c, f) {   // 幅值:H(z)=B(z)/A(z) 在 z=e^{jw} 复数求模,dB=20*log10(|B|/|A|)
      const w = 2 * Math.PI * f / Fs, cw = Math.cos(w), sw = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
      const nRe = c[0] + c[1] * cw + c[2] * c2, nIm = -(c[1] * sw + c[2] * s2);
      const dRe = c[3] + c[4] * cw + c[5] * c2, dIm = -(c[4] * sw + c[5] * s2);
      return 20 * Math.log10(Math.max(1e-9, Math.hypot(nRe, nIm) / Math.max(1e-9, Math.hypot(dRe, dIm))));
    }
    function drawEq() {
      // 入 DOM 后按容器实测宽调整画布(首次绘制在 append 之后)
      const want = Math.max(280, Math.min(480, (cvBox.clientWidth || 462) - 2));
      if (want !== EQW) {
        EQW = want;
        cv.width = EQW * dpr;
        cv.style.width = EQW + "px";
      }
      const ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, EQW, EQH);
      ctx.font = "10px Consolas, monospace";
      // 频率轴:log10,20 Hz–20 kHz;刻度 50/100/200/500/1K/2K/5K/10K
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
        const x = eqX(f);
        ctx.strokeStyle = "rgba(139,145,160,0.18)";
        ctx.beginPath(); ctx.moveTo(x, MT); ctx.lineTo(x, EQH - MB); ctx.stroke();
        ctx.fillStyle = "#8b91a0";
        ctx.fillText(f >= 1000 ? (f / 1000) + "k" : String(f), x, EQH - MB + 3);
      }
      // 纵轴 ±18 dB,0 线加亮
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      for (const db of [-12, -6, 0, 6, 12]) {
        const y = eqY(db);
        ctx.strokeStyle = db === 0 ? "rgba(240,170,40,0.45)" : "rgba(139,145,160,0.15)";
        ctx.beginPath(); ctx.moveTo(ML, y); ctx.lineTo(EQW - MR, y); ctx.stroke();
        ctx.fillStyle = "#8b91a0";
        ctx.fillText((db > 0 ? "+" : "") + db, ML - 4, y);
      }
      const byp = edCur("FxEqBypass", ch) === 1;
      const coeffs = bands.map(b => {
        if (byp || edCur(b.onf, ch) !== 1) return null;   // 段关闭/旁通跳过
        const f0 = pitchFreqHz(edCur(b.freq, ch)), g = (edCur(b.gain, ch) - 180) / 10;
        // MID Q 显示近似:raw max 60 ↔ 官方 16.00,只影响曲线胖瘦
        return b.kind === "peak" ? peakC(f0, g, 0.5 + edCur("FxEqMidQual", ch) * (15.5 / 60)) : shelfC(f0, g, b.kind === "high");
      });
      ctx.strokeStyle = "#f0aa28"; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 240; i++) {
        const f = F_MIN * Math.pow(F_MAX / F_MIN, i / 240);
        let db = 0;
        for (const c of coeffs) if (c) db += magDb(c, f);
        const x = eqX(f), y = eqY(Math.max(-DB_MAX, Math.min(DB_MAX, db)));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      for (const b of bands) {
        b.px = eqX(pitchFreqHz(edCur(b.freq, ch)));
        b.py = eqY((edCur(b.gain, ch) - 180) / 10);
        ctx.beginPath();
        ctx.arc(b.px, b.py, 6, 0, 2 * Math.PI);
        const off = byp || edCur(b.onf, ch) !== 1;
        if (off) { ctx.strokeStyle = b.color; ctx.lineWidth = 1.5; ctx.stroke(); }
        else { ctx.fillStyle = b.color; ctx.fill(); ctx.strokeStyle = "#0c0e12"; ctx.lineWidth = 1.5; ctx.stroke(); }
      }
      if (byp) {
        ctx.fillStyle = "rgba(139,145,160,0.85)";
        ctx.font = "600 14px 'Segoe UI', sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("EQ 旁通", EQW / 2, EQH / 2 - 6);
      }
    }
    let eqRaf = 0;
    function scheduleEqRedraw() { if (!eqRaf) eqRaf = requestAnimationFrame(() => { eqRaf = 0; drawEq(); }); }
    // 手柄拖拽:x→Freq、y→Gain,经 edSetParamUI 走工厂 40ms 防抖 + ALL_CONTROLS 同步
    // (raw 反解:raw = 4 + 12*log2(f/20),clamp 到 def.min/max)
    let dragBand = -1;
    cv.addEventListener("pointerdown", e => {
      const r = cv.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      dragBand = -1; let bd = 15;
      bands.forEach((b, i) => { const d = Math.hypot(px - b.px, py - b.py); if (d < bd) { bd = d; dragBand = i; } });
      if (dragBand >= 0) { try { cv.setPointerCapture(e.pointerId); } catch (err) { } }
    });
    cv.addEventListener("pointermove", e => {
      if (dragBand < 0) return;
      const r = cv.getBoundingClientRect();
      const px = Math.max(ML, Math.min(EQW - MR, e.clientX - r.left));
      const py = Math.max(MT, Math.min(EQH - MB, e.clientY - r.top));
      const f = Math.pow(10, Math.log10(F_MIN) + (px - ML) / (EQW - ML - MR) * (Math.log10(F_MAX) - Math.log10(F_MIN)));
      const db = DB_MAX - (py - MT) / (EQH - MT - MB) * 2 * DB_MAX;
      const b = bands[dragBand];
      const fd = defs[b.freq], gd = defs[b.gain];
      if (fd) edSetParamUI(b.freq, ch, Math.round(Math.max(fd.min, Math.min(fd.max, 4 + 12 * Math.log2(f / F_MIN)))));
      if (gd) edSetParamUI(b.gain, ch, Math.round(Math.max(gd.min, Math.min(gd.max, 180 + db * 10))));
    });
    window.addEventListener("pointerup", () => { dragBand = -1; });
    // 重绘触发:设备回值走 chainApply;用户操作走直连监听(apply 只在 probeAll/场景时跑)
    for (const n of ["FxEqLsvFreq", "FxEqLsvGain", "FxEqMidFreq", "FxEqMidGain", "FxEqHsvFreq", "FxEqHsvGain", "FxEqMidQual", "FxEqLsvOnf", "FxEqMidOnf", "FxEqHsvOnf"]) {
      chainApply(n, ch, scheduleEqRedraw);
    }
    chainApply("FxEqBypass", ch, v => { eqBody.classList.toggle("ed-dim", v === 1); scheduleEqRedraw(); });
    for (const c of [lowF, lowG, midF, midG, midQ, highF, highG]) onCtlInput(c, "input", scheduleEqRedraw);
    // 预置 entry.cur 再重绘:工厂 click 的 cur 更新在 await 之后,直接读会拿到旧值
    function toggleCur(name, v) { const d = defs[name]; if (!d) return; const en = ALL_CONTROLS.filter(c => c.id === d.id && c.ch === ch).pop(); if (en) en.cur = v ? 1 : 0; }
    for (const [t, n] of [[lowOn, "FxEqLsvOnf"], [midOn, "FxEqMidOnf"], [highOn, "FxEqHsvOnf"]]) {
      onTogglePredict(t, v => { toggleCur(n, v); scheduleEqRedraw(); });
    }
    onTogglePredict(eqBy, v => { toggleCur("FxEqBypass", v); eqBody.classList.toggle("ed-dim", v); scheduleEqRedraw(); });

    // ---- MORPH 列 ----
    const morph = edCol("MORPHING");
    const mv = makeSlider("FxMorphValue", ch, { vertical: true });
    if (mv) { mv.classList.add("morph-slider"); morph.appendChild(mv); }
    const outSec = edSec("OUTPUT");
    // 纠正:输出 = FxEqPeqGain(整个 EQ 的总输出音量;现版误用 FxCompMakeupOfst)
    const of = makeSlider("FxEqPeqGain", ch, { horizontal: true });
    if (of) {
      const lab = of.querySelector(".ctl-label");
      if (lab && lab.firstChild) lab.firstChild.textContent = "输出 OUTPUT";
      outSec.appendChild(of);
    }
    morph.appendChild(outSec);
    add(morph, makeToggle("FxStereoLinkOnf", ch, "立体声链接"));   // 页脚(官方不露,可选保留)
    cols.appendChild(morph);

    root.appendChild(cols);
    page.appendChild(root);
    drawEq();   // 先入 DOM 拿到 EQ 列实测宽,再首绘
  }

  // Guitar Amp Classics(ChFxInsType 2-5)— 型号感知:只渲染当前 GtrFxType 型号的参数(规格 3 节)
  async function renderGA(ch, page) {
    const add = (parent, ctl) => { if (ctl) parent.appendChild(ctl); return ctl; };
    const model = Math.max(0, Math.min(3, lastSub >= 0 ? lastSub : 0));
    const P = ["Clean", "Crunch", "Lead", "Drive"][model];
    edResize(940, 700);
    const root = edRoot();
    const header = edHeader(`GA CLASSICS · 输入 ${ch + 1}`, GTRTYPE_LABELS[model]);
    const tsel = add(header, makeSelect("GtrFxType", ch, GTRTYPE_LABELS));
    if (tsel) onCtlInput(tsel, "change", scheduleRerender);   // 编辑窗内换型号即时重绘
    const gb = add(header, makeToggle("GtrFxBypass", ch, "吉他箱体旁通"));
    header.appendChild(edMetersBox(
      makeEdMeterPair(26, 27, "IN"),     // gfx_in(全局 L/R,与型号无关)
      makeEdMeterPair(28, 29, "OUT"),    // gfx_out
    ));
    root.appendChild(header);

    const cols = document.createElement("div"); cols.className = "ed-cols";
    const main = edCol(null);
    main.style.flex = "1 1 auto"; main.style.minWidth = "0";

    // 放大器 AMP——随型号换控件组
    const amp = edSec("放大器 AMP");
    const ampGrid = document.createElement("div"); ampGrid.className = "ed-grid4";
    let chorusSel = null;
    if (model === 0) {          // CLEAN:音量|失真|干湿混合|Cho/OFF/Vib
      add(ampGrid, makeSlider("GtrFxCleanVolume", ch, { horizontal: true }));
      add(ampGrid, makeSlider("GtrFxCleanDistortion", ch, { horizontal: true }));
      add(ampGrid, makeSlider("GtrFxCleanBlend", ch, { horizontal: true }));
      chorusSel = add(ampGrid, makeSelect("GtrFxCleanChorus", ch, CHORUS_LABELS));
    } else if (model === 1) {   // CRUNCH:Normal/Bright|音量(GAIN)
      add(ampGrid, makeSelect("GtrFxCrunchType", ch, CRUNCHTYPE_LABELS));
      add(ampGrid, makeSlider("GtrFxCrunchVolume", ch, { horizontal: true }));
    } else if (model === 2) {   // LEAD:High/Low|前级 GAIN|Master
      add(ampGrid, makeSelect("GtrFxLeadSensitivity", ch, LEADSENS_LABELS));
      add(ampGrid, makeSlider("GtrFxLeadPreAmp", ch, { horizontal: true }));
      add(ampGrid, makeSlider("GtrFxLeadMaster", ch, { horizontal: true }));
    } else {                    // DRIVE:AMP TYPE 1-6|GAIN|Master
      add(ampGrid, makeSelect("GtrFxDriveType", ch, DRIVETYPE_LABELS));
      add(ampGrid, makeSlider("GtrFxDriveGain", ch, { horizontal: true }));
      add(ampGrid, makeSlider("GtrFxDriveMaster", ch, { horizontal: true }));
    }
    amp.appendChild(ampGrid);
    main.appendChild(amp);

    // 音色 TONE
    const tone = edSec("音色 TONE");
    const toneGrid = document.createElement("div"); toneGrid.className = "ed-grid4";
    add(toneGrid, makeSlider(`GtrFx${P}Treble`, ch, { horizontal: true }));
    add(toneGrid, makeSlider(`GtrFx${P}Middle`, ch, { horizontal: true }));
    add(toneGrid, makeSlider(`GtrFx${P}Bass`, ch, { horizontal: true }));
    add(toneGrid, makeSlider(model === 0 ? "GtrFxCleanHiTreble" : `GtrFx${P}Presence`, ch, { horizontal: true }));
    tone.appendChild(toneGrid);
    main.appendChild(tone);

    // 箱体 CAB:SP TYPE|话筒位|[音箱示意 P2]|输出 OUTPUT
    const cab = edSec("箱体 CAB");
    const cabGrid = document.createElement("div"); cabGrid.className = "ed-grid4";
    add(cabGrid, makeSelect(`GtrFx${P}SpType`, ch, SPTYPE_LABELS, { honMin: true }));
    add(cabGrid, makeSelect(`GtrFx${P}MicPosition`, ch, MICPOS_LABELS));
    const p2 = document.createElement("div"); p2.className = "ed-p2"; p2.textContent = "音箱示意图 P2";
    cabGrid.appendChild(p2);
    add(cabGrid, makeSlider(`GtrFx${P}Output`, ch, { horizontal: true }));
    cab.appendChild(cabGrid);
    main.appendChild(cab);

    // 噪声门 GATE(四型号共享;Range/Attack/Hold/Decay 官方不露,仅主窗可见)
    const gate = edSec("噪声门 GATE");
    const gateRow = document.createElement("div"); gateRow.className = "ed-grid4";
    add(gateRow, makeToggle("GtrFxGateOnf", ch, "噪声门启用"));
    add(gateRow, makeSlider("GtrFxGateLevel", ch, { horizontal: true }));
    gate.appendChild(gateRow);
    main.appendChild(gate);

    // 调制 MOD(仅 CLEAN;Cho/OFF/Vib 仅 Vib 时生效 → .ed-off 联动)
    let modSec = null;
    if (model === 0) {
      modSec = edSec("调制 MOD");
      const modGrid = document.createElement("div"); modGrid.className = "ed-grid4";
      add(modGrid, makeSlider("GtrFxCleanVibSpeed", ch, { horizontal: true }));
      add(modGrid, makeSlider("GtrFxCleanVibDepth", ch, { horizontal: true }));
      modSec.appendChild(modGrid);
      main.appendChild(modSec);
    }
    cols.appendChild(main);
    root.appendChild(cols);
    page.appendChild(root);

    if (chorusSel && modSec) {
      const modSync = () => { const v = parseInt(ctlInput(chorusSel).value, 10); modSec.classList.toggle("ed-off", v !== 2); };
      onCtlInput(chorusSel, "change", modSync);
      chainApply("GtrFxCleanChorus", ch, v => modSec.classList.toggle("ed-off", v !== 2));
      modSync();
    }
  }

  // REV-X(type 8,入口 fx-{ch}-7;全局效果,参数 ch=0)— 规格 2 节
  async function renderRevX(ch, page) {
    const add = (parent, ctl) => { if (ctl) parent.appendChild(ctl); return ctl; };
    const variant = Math.max(0, Math.min(3, lastSub >= 0 ? lastSub : 0));
    edResize(variant === 3 ? 660 : 980, variant === 3 ? 440 : 660);   // 官方 1061x803 / 705x437
    const root = edRoot();
    const header = edHeader("REV-X", variant === 3 ? "Delay" : REVTYPE_LABELS[variant]);
    const tsel = add(header, makeSelect("FxRevType", 0, REVTYPE_LABELS));
    if (tsel) onCtlInput(tsel, "change", scheduleRerender);   // Hall/Room/Plate ↔ Delay 换变体即时重绘
    const byT = add(header, makeToggle("FxRevBypass", 0, "混响旁通"));
    header.appendChild(edMetersBox(
      makeEdMeterPair(32, 33, "IN"),    // revx_snd:效果器输入(发送侧)
      makeEdMeterPair(30, 31, "OUT"),   // revx_rtn:返回电平表(rtn 先于 snd,meter_map 已证实)
    ));
    root.appendChild(header);

    const body = document.createElement("div"); body.className = "ed-cols"; body.style.alignItems = "stretch";
    // 左 55%:包络示意 canvas(P2,静态占位)
    const env = edCol(null);
    env.style.flex = "0 0 55%";
    const envBox = document.createElement("div"); envBox.className = "ed-canvas-box ed-env-box";
    envBox.innerHTML = `<div class="ed-p2-note">衰减包络示意图<br>(P2 预留:由 Time / Decay / HighRatio / LowRatio 画静态包络)</div>`;
    env.appendChild(envBox);
    body.appendChild(env);
    // 右列:参数网格(横滑条,严格按 RevHall DLL 顺序)
    const gridCol = edCol(null);
    gridCol.style.flex = "1 1 auto";
    const grid = document.createElement("div"); grid.className = "ed-grid2";
    if (variant === 3) {
      // Delay 变体(192 kHz 官方禁 STEREO,编辑窗内不检测,注明 P2)
      add(grid, makeSelect("FxDelayStereo", 0, STEREO_LABELS, { honMin: true }));
      add(grid, makeSlider("FxDelayTime", 0, { horizontal: true, honMin: true }));
      add(grid, makeSlider("FxDelayFeedback", 0, { horizontal: true, honMin: true }));   // min 64 = 官方 0
      add(grid, makeSlider("FxDelayHighRatio", 0, { horizontal: true, honMin: true }));
      grid.appendChild(edNote("注:192 kHz 采样率下官方禁用立体声延迟(此处不检测,采样率见路由页)。"));
    } else {
      for (const n of ["FxRevTime", "FxRevDiff", "FxRevIniDly", "FxRevHpf", "FxRevLpf", "FxRevRoomSize",
        "FxRevHighRatio", "FxRevLowRatio", "FxRevDecay", "FxRevBal", "FxRevLowFreq"]) {
        add(grid, makeSlider(n, 0, { horizontal: true, honMin: true }));
      }
    }
    gridCol.appendChild(grid);
    body.appendChild(gridCol);
    root.appendChild(body);
    page.appendChild(root);

    // 旁通联动:参数网格置灰(仍可见可点)
    chainApply("FxRevBypass", 0, v => grid.classList.toggle("ed-dim", v === 1));
    onTogglePredict(byT, v => grid.classList.toggle("ed-dim", v));
    chainApply("FxRevType", 0, scheduleRerender);   // 设备回值兜底
  }

  // Pitch Fix(ChFxInsType=6;参数按编辑器通道)— 规格 4 节
  async function renderPitchFix(ch, page) {
    const add = (parent, ctl) => { if (ctl) parent.appendChild(ctl); return ctl; };
    edResize(800, 640);
    const root = edRoot();
    const header = edHeader(`PITCH FIX · 输入 ${ch + 1}`);
    add(header, makeToggle("PitchFixOnf", ch, "Pitch Fix 启用"));
    // 89 通道里无已标定 pitchfix 电平表 → 不放电平表,header 留白
    root.appendChild(header);

    const cols = document.createElement("div"); cols.className = "ed-cols";
    // 左列:修正 CORRECTION
    const corr = edCol("修正 CORRECTION");
    const corrOn = add(corr, makeToggle("PitchFixCorrectOnf", ch, "修正开关"));
    const corrBody = edFlow();
    const ksRow = document.createElement("div"); ksRow.className = "ed-grid2";
    add(ksRow, makeSelect("PitchFixCorrectKey", ch, KEY_LABELS));
    add(ksRow, makeSelect("PitchFixCorrectScale", ch, SCALE_LABELS));
    corrBody.appendChild(ksRow);
    // 键盘网格 6 列 × 2 行;黑键深色
    const noteGrid = document.createElement("div"); noteGrid.className = "ed-note-grid";
    const NOTE_KEYS = ["C", "Cs", "D", "Ds", "E", "F", "Fs", "G", "Gs", "A", "As", "B"];
    NOTE_KEYS.forEach((k, i) => {
      const b = makeToggle("PitchFixCorrect" + k, ch, NOTE_NAMES[i]);
      if (!b) return;
      if (k.length === 2) b.classList.add("black");   // Cs/Ds/Fs/Gs/As
      noteGrid.appendChild(b);
    });
    corrBody.appendChild(noteGrid);
    add(corrBody, makeSlider("PitchFixCorrectRate", ch, { horizontal: true }));
    add(corrBody, makeSlider("PitchFixCorrectSense", ch, { horizontal: true }));
    corr.appendChild(corrBody);
    // 输出 OUTPUT(ed-col 底)
    const outSec = edSec("输出 OUTPUT");
    add(outSec, makeSlider("PitchFixMixLevel", ch, { horizontal: true }));
    corr.appendChild(outSec);
    cols.appendChild(corr);

    // 右列:移调 TRANSPOSE + MIDI(两个盒竖排)
    const right = document.createElement("div");
    right.style.cssText = "flex:1 1 0;display:flex;flex-direction:column;gap:12px;min-width:260px;";
    const trans = edCol("移调 TRANSPOSE");
    add(trans, makeSlider("PitchFixLeadTranspose", ch, { horizontal: true, honMin: true }));
    add(trans, makeSlider("PitchFixHarmTranspose", ch, { horizontal: true, honMin: true }));
    add(trans, makeSlider("PitchFixLeadFormant", ch, { horizontal: true, honMin: true }));
    add(trans, makeSlider("PitchFixHarmFormant", ch, { horizontal: true, honMin: true }));
    add(trans, makeSlider("PitchFixHarmCorrectSense", ch, { horizontal: true }));
    right.appendChild(trans);
    const midi = edCol("MIDI 控制");
    const midiOn = add(midi, makeToggle("PitchFixMidiControlOnf", ch, "MIDI 控制"));
    add(midi, makeSelect("PitchFixMidiControlMode", ch, MIDIMODE_LABELS));
    add(midi, makeSlider("PitchFixMidiNoteLimitLow", ch, { horizontal: true }));
    add(midi, makeSlider("PitchFixMidiNoteLimitHigh", ch, { horizontal: true }));
    right.appendChild(midi);
    cols.appendChild(right);

    root.appendChild(cols);
    page.appendChild(root);

    // 联动:修正关 → 修正区其余控件置灰禁点;MIDI 开 → 键盘网格置灰禁点(官方:MIDI 激活禁键盘)
    function toggleCur(name, v) { const d = defs[name]; if (!d) return; const en = ALL_CONTROLS.filter(c => c.id === d.id && c.ch === ch).pop(); if (en) en.cur = v ? 1 : 0; }
    chainApply("PitchFixCorrectOnf", ch, v => corrBody.classList.toggle("ed-off", v === 0));
    onTogglePredict(corrOn, v => { toggleCur("PitchFixCorrectOnf", v); corrBody.classList.toggle("ed-off", !v); });
    chainApply("PitchFixMidiControlOnf", ch, v => noteGrid.classList.toggle("ed-off", v === 1));
    onTogglePredict(midiOn, v => { toggleCur("PitchFixMidiControlOnf", v); noteGrid.classList.toggle("ed-off", v); });
  }

  // 兜底 A:t=0 无效果(规格 5 节)
  function renderNone(page) {
    edResize(430, 620);   // 回到后端建窗默认尺寸
    const root = edRoot();
    const card = document.createElement("div");
    card.className = "ed-empty";
    card.innerHTML = `<div class="ed-empty-title">此槽位当前为『无效果』</div>` +
      `<div class="ed-hint">在主窗口调音台或效果器页选择效果类型后,这里会出现对应的编辑器。</div>`;
    root.appendChild(card);
    page.appendChild(root);
  }

  // 兜底 B:t=7 或其他未知值(通用平铺保留,外壳换 .ed-root)
  function renderUnknown(t, page) {
    const root = edRoot();
    root.appendChild(edHeader(`类型 ${t}(未标定布局)`));
    root.appendChild(edNote("该类型的官方布局未逆向完成,以下为参数平铺。"));
    const fams = famByType[t];
    if (fams) {
      const names = [];
      const seen = new Set();
      for (const re of fams) {
        for (const n of Object.keys(defs).filter(n => re.test(n))) {
          if (!seen.has(n) && !ED_HIDDEN(n)) { seen.add(n); names.push(n); }
        }
      }
      if (names.length) {
        const grid = document.createElement("div");
        grid.className = "fx-grid";
        grid.style.padding = "8px";
        for (const n of names) {
          const def = defs[n];
          if (def.max <= 1) { const c = makeToggle(n, ch); if (c) grid.appendChild(c); }
          else if (def.max <= 6) { const c = makeSelect(n, ch); if (c) grid.appendChild(c); }
          else { const c = makeSlider(n, ch); if (c) grid.appendChild(c); }
        }
        root.appendChild(grid);
      }
    }
    page.appendChild(root);
  }

  window.__edStep = "render-done";
  await render();
  // watch for effect-type / model changes (e.g. made in the main window) and re-render;
  // GA 的 GtrFxType、REV-X 的 FxRevType 由 render() 每轮重查比对
  setInterval(async () => {
    try { await render(); } catch (e) { }
  }, 2500);
}

async function normalBoot(list) {
  const mix = document.querySelector("#page-mix");
  mix.appendChild(channelStrip(0, "输入 1", true));
  mix.appendChild(channelStrip(1, "输入 2", false));
  mix.appendChild(dawStrip(0, "DAW 1"));
  mix.appendChild(dawStrip(1, "DAW 2"));
  mix.appendChild(masterStrip("1"));
  mix.appendChild(masterStrip("2"));
  mix.appendChild(monitorStrip());
  mix.appendChild(recTestPanel());
  const fx = document.querySelector("#page-fx");
  for (const g of FX_GROUPS) fx.appendChild(fxPanel(g));
  const route = document.querySelector("#page-route");
  route.appendChild(routingPanel());
  document.querySelector("#meter-rail").appendChild(meterRail());
  setupTabs();
  await setStage(`[defs:${list.length} ctl:${ALL_CONTROLS.length}]`);

  // event pump: pull pending events from the backend at 10 Hz (meters + replies/raw)
  function handleMeter(entries) {
    document.querySelector("#meter-note").textContent = "推送中";
    // diagnostic grid (89 channels; dB = (v-8191)/102.4 per steinmixer calibration)
    entries.slice(0, meterBars.length).forEach((v, i) => {
      const m = meterBars[i];
      m.bar.style.height = (meterValue(v[0]) * 100).toFixed(1) + "%";
      m.peak.style.bottom = (meterValue(v[1]) * 100).toFixed(1) + "%";
      const db = ((v[0] - 8191) / 102.4).toFixed(1);
      m.w.title = `ch${i} cur=${v[0]} (${db} dB) peak=${v[1]}`;
    });
    // per-strip meters (DAW style, beside the fader) — one key can drive several elements
    for (const [key, idx] of Object.entries(METER_MAP)) {
      const els = stripMeterEls[key];
      const ch = entries[idx];
      if (!els || !ch) continue;
      for (const m of els) {
        m.bar.style.height = (meterValue(ch[0]) * 100).toFixed(1) + "%";
        m.peak.style.bottom = (meterValue(ch[1]) * 100).toFixed(1) + "%";
      }
    }
  }
  function handleEvent(p) {
    if (p.kind === "raw") logLine("RX " + p.hex);
    else if (p.kind === "device") setConnected({ connected: false, error: "设备插拔,请重连" });
    else if (p.kind === "rec-done") {
      // auto-stop at max duration (or error) reported by the backend recording thread
      if (recDoneHook) recDoneHook(p);
    }
  }
  setInterval(async () => {
    try {
      const d = await invoke("drain_events");
      if (d.meter) handleMeter(d.meter.entries);
      for (const p of d.events) handleEvent(p);
    } catch (e) { /* offline */ }
  }, 100);

  document.querySelector("#btn-reconnect").addEventListener("click", async () => {
    try {
      const info = await invoke("reconnect");
      setConnected(info);
      if (info.connected) await probeAll();
    } catch (e) { setConnected({ connected: false, error: String(e) }); }
  });
  document.querySelector("#btn-refresh").addEventListener("click", () => probeAll());

  document.querySelector("#btn-scene-save").addEventListener("click", () => sceneSave().catch(e => toast(String(e))));
  document.querySelector("#btn-scene-load").addEventListener("click", () => sceneLoad().catch(e => toast(String(e))));
  document.querySelector("#btn-scene-init").addEventListener("click", () => sceneInit().catch(e => toast(String(e))));
  refreshSceneList().catch(() => {});

  // recording test: show the matched UR-C capture endpoints for diagnostics
  invoke("list_capture_devices").then(names => {
    const el = document.querySelector("#rec-devs");
    if (el && names.length) el.textContent = "录音端点: " + names.join(" · ");
  }).catch(() => {});

  try {
    let info = await invoke("device_info");
    if (!info.connected) info = await invoke("connect");
    setConnected(info);
    if (info.connected) await probeAll();
  } catch (e) {
    setConnected({ connected: false, error: String(e) });
    logLine("连接失败: " + e);
  }
}
