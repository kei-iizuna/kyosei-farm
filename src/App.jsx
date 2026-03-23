import { useState, useMemo, useEffect, useRef } from "react";

// ── ユーティリティ: 旬の変換 ─────────────────────────────────────────────
const toCode   = (m, j) => m * 3 + j;
const fromCode = (code) => ({ m: Math.floor(code / 3), j: code % 3 });
const JNAME    = ["上旬", "中旬", "下旬"];
const JSHORT   = ["上", "中", "下"];

function parseJun(str) {
  if (typeof str === "number") return str * 3;
  const m = parseInt(str);
  const j = str.includes("下") ? 2 : str.includes("中") ? 1 : 0;
  return toCode(m, j);
}

function codeToLabel(code) {
  const { m, j } = fromCode(code);
  return `${m}月${JNAME[j]}`;
}

function inRange(code, startCode, endCode) {
  if (startCode <= endCode) return code >= startCode && code <= endCode;
  return code >= startCode || code <= endCode;
}

function currentJunCode() {
  const now = new Date();
  const m   = now.getMonth() + 1;
  const d   = now.getDate();
  const j   = d <= 10 ? 0 : d <= 20 ? 1 : 2;
  return toCode(m, j);
}

// ── 都道府県リスト ──────────────────────────────────────────────────────
const PREFECTURES = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県",
  "静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県",
  "奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県",
  "熊本県","大分県","宮崎県","鹿児島県","沖縄県"
];

// ── Open-Meteo API で気候データ取得 ─────────────────────────────────────
// Open-Meteo Historical Weather API で月別平均気温を取得
async function fetchClimateFromAPI(lat, lon, altitude) {
  // Open-Meteo Historical API: 過去10年分の月別集計
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2014-01-01&end_date=2023-12-31&monthly=temperature_2m_mean,temperature_2m_min&timezone=Asia%2FTokyo`;
  const res  = await fetch(url);
  const data = await res.json();

  if (!data.monthly || !data.monthly.time) {
    throw new Error("気候データの取得に失敗しました。座標を確認してください。");
  }

  // 標高補正：100mごとに-0.6℃
  const altCorrection = ((altitude || 0) - (data.elevation || 0)) * (-0.006);

  // 月別平均を計算（複数年分を平均）
  const monthlyAvg = Array(13).fill(0).map(() => ({ sum: 0, count: 0 }));
  const monthlyMin = Array(13).fill(0).map(() => ({ sum: 0, count: 0 }));

  data.monthly.time.forEach((dateStr, i) => {
    const m    = parseInt(dateStr.split("-")[1]);
    const mean = data.monthly.temperature_2m_mean[i];
    const min  = data.monthly.temperature_2m_min[i];
    if (mean !== null && mean !== undefined) { monthlyAvg[m].sum += mean; monthlyAvg[m].count++; }
    if (min  !== null && min  !== undefined) { monthlyMin[m].sum += min;  monthlyMin[m].count++; }
  });

  // 旬データを生成
  const juns = [];
  for (let m = 1; m <= 12; m++) {
    const avgBase = monthlyAvg[m].count > 0 ? monthlyAvg[m].sum / monthlyAvg[m].count : 10;
    const minBase = monthlyMin[m].count > 0 ? monthlyMin[m].sum / monthlyMin[m].count : 5;
    const avg     = Math.round((avgBase + altCorrection) * 10) / 10;
    const minT    = Math.round((minBase + altCorrection) * 10) / 10;

    // 旬ごとに微調整（上旬はやや低め、下旬はやや高め）
    for (let j = 0; j < 3; j++) {
      const offset    = (j - 1) * 0.5;
      const junAvg    = Math.round(avg + offset);
      const junMin    = Math.round(minT + offset);
      const frost     = junMin <= -1 ? true : junMin <= 2 ? "risk" : false;
      // 積雪判定：平均気温が2℃以下かつ月降水量が多い（簡易判定）
      const snow      = junAvg <= 2;

      // 旬ごとの農作業メモをAIに頼らず簡易生成
      const work = generateWork(m, j, frost, snow, junAvg);

      juns.push({
        code:     toCode(m, j),
        label:    `${m}月${JNAME[j]}`,
        avgTemp:  junAvg,
        minTemp:  junMin,
        frost,
        snow,
        work,
      });
    }
  }
  return juns;
}

function generateWork(m, j, frost, snow, avgTemp) {
  if (snow && avgTemp <= 0)  return "積雪・厳冬期。屋内での計画・農具メンテナンス。";
  if (snow && avgTemp <= 4)  return "雪解け待ち。ハウス内での育苗準備。";
  if (frost === true)        return "霜あり。ハウス内での播種・育苗が中心。屋外作業は限定的。";
  if (frost === "risk")      return "霜リスクあり。耐寒性の高い作物はトンネルで対応可。";
  if (m >= 3 && m <= 5)      return "春作業開始。播種・定植の準備。土づくり。";
  if (m >= 6 && m <= 8)      return "夏野菜の管理・収穫。水やり・追肥・支柱立て。";
  if (m >= 9 && m <= 10)     return "秋収穫の最盛期。越冬野菜の準備。霜対策を忘れずに。";
  return "農閑期の準備・計画。来季に向けた土壌改良。";
}

// ── 国土地理院APIで標高取得 ─────────────────────────────────────────────
async function fetchAltitude(lat, lon) {
  const url = `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=${lon}&lat=${lat}&outtype=JSON`;
  const res  = await fetch(url);
  const data = await res.json();
  return Math.round(data.elevation || 0);
}

// ── Geocoding: 市区町村名 → 座標 ────────────────────────────────────────
async function geocodeCity(prefecture, city) {
  const query = `${prefecture}${city}`;
  const url   = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=jp`;
  const res   = await fetch(url, { headers: { "Accept-Language": "ja" } });
  const data  = await res.json();
  if (!data || data.length === 0) throw new Error("地名が見つかりませんでした");
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

// ── カテゴリカラー ───────────────────────────────────────────────────────
const CAT_COLORS = {
  "野菜・葉物":   { bg:"#d4edda", accent:"#1b5e20", dot:"#52b788" },
  "野菜・実物":   { bg:"#fde8d8", accent:"#9c4221", dot:"#e07b39" },
  "根菜・球根":   { bg:"#ede0cc", accent:"#5d3a1a", dot:"#a0522d" },
  "果樹・木本類": { bg:"#fff3cd", accent:"#856404", dot:"#f4a732" },
  "ハーブ・薬草": { bg:"#e8d5f5", accent:"#6a1b9a", dot:"#ab47bc" },
  "穀物・豆類":   { bg:"#dce8f5", accent:"#1a4971", dot:"#4a90d9" },
  "高冷地特産":   { bg:"#e0f7fa", accent:"#006064", dot:"#00acc1" },
};
const CATEGORIES = ["すべて","野菜・葉物","野菜・実物","根菜・球根","果樹・木本類","ハーブ・薬草","穀物・豆類","高冷地特産"];

// ── 旬バー ───────────────────────────────────────────────────────────────
function JunBar({ startCode, endCode, color, currentCode }) {
  const allCodes = Array.from({ length:36 }, (_,i) => toCode(Math.floor(i/3)+1, i%3));
  return (
    <div style={{ display:"flex", gap:1, flexWrap:"nowrap", alignItems:"center" }}>
      {allCodes.map((code, i) => {
        const active    = inRange(code, startCode, endCode);
        const isCurrent = code === currentCode;
        const { j }     = fromCode(code);
        return (
          <div key={code} style={{
            width:7, height:10, borderRadius:1,
            background:   isCurrent ? "#fff" : active ? color : "#e5e7eb",
            marginLeft:   j===0 && i>0 ? 3 : 0,
            outline:      isCurrent ? `2px solid ${color}` : "none",
            flexShrink:   0,
          }} />
        );
      })}
    </div>
  );
}

function JunBarWithLabels({ startCode, endCode, color, currentCode }) {
  const allCodes = Array.from({ length:36 }, (_,i) => toCode(Math.floor(i/3)+1, i%3));
  return (
    <div>
      <div style={{ display:"flex", gap:1, marginBottom:1 }}>
        {Array.from({ length:12 }, (_,mi) => (
          <div key={mi} style={{ width:7*3+3*2, flexShrink:0, fontSize:8, color:"#bbb", textAlign:"center", marginLeft:mi>0?3:0 }}>
            {mi+1}
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:1, alignItems:"center" }}>
        {allCodes.map((code, i) => {
          const active    = inRange(code, startCode, endCode);
          const isCurrent = code === currentCode;
          const { j }     = fromCode(code);
          return (
            <div key={code} title={codeToLabel(code)} style={{
              width:7, height:10, borderRadius:1,
              background:   isCurrent ? "#fff" : active ? color : "#e5e7eb",
              marginLeft:   j===0 && i>0 ? 3 : 0,
              outline:      isCurrent ? `2px solid ${color}` : "none",
              flexShrink:   0,
            }} />
          );
        })}
      </div>
      <div style={{ display:"flex", gap:1, marginTop:1 }}>
        {allCodes.map((code,i) => {
          const { j } = fromCode(code);
          return <div key={code} style={{ width:7, flexShrink:0, marginLeft:j===0&&i>0?3:0, fontSize:6, color:"#ddd", textAlign:"center" }}>{JSHORT[j]}</div>;
        })}
      </div>
    </div>
  );
}

function AltBadge({ rating }) {
  const color = rating >= 5 ? "#2d6a4f" : rating === 4 ? "#2d6a4f" : rating === 3 ? "#f59e0b" : "#e07b39";
  const label = rating >= 5 ? "★ 最適" : rating === 4 ? "◎ 良好" : rating === 3 ? "△ 工夫要" : "✗ 困難";
  return <span style={{ fontSize:10, color, fontWeight:700, background:color+"15", borderRadius:10, padding:"1px 7px", border:`1px solid ${color}40` }}>{label}</span>;
}

// ── 地域登録画面 ─────────────────────────────────────────────────────────
function LocationSetup({ onComplete }) {
  const [prefecture, setPrefecture] = useState("長野県");
  const [city,       setCity]       = useState("");
  const [altitude,   setAltitude]   = useState("");
  const [useGPS,     setUseGPS]     = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [status,     setStatus]     = useState("");
  const [gpsCoords,  setGpsCoords]  = useState(null);

  const handleGPS = () => {
    if (!navigator.geolocation) { setStatus("❌ このブラウザはGPSに対応していません"); return; }
    setLoading(true);
    setStatus("📍 位置情報を取得中...");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setGpsCoords({ lat, lon });
        try {
          const alt = await fetchAltitude(lat, lon);
          setAltitude(String(alt));
          setStatus(`✅ 標高 ${alt}m を取得しました`);
        } catch(e) {
          setStatus("⚠️ 標高の自動取得に失敗。手動で入力してください。");
        }
        setLoading(false);
      },
      (err) => {
        setStatus("❌ 位置情報の取得に失敗しました。手動で入力してください。");
        setLoading(false);
      }
    );
  };

  const handleSubmit = async () => {
    if (!city.trim()) { setStatus("⚠️ 市区町村名を入力してください"); return; }
    if (!altitude)    { setStatus("⚠️ 標高を入力してください"); return; }

    setLoading(true);
    setStatus("🌐 地域データを取得中...");
    try {
      let lat, lon;
      if (gpsCoords) {
        lat = gpsCoords.lat;
        lon = gpsCoords.lon;
      } else {
        setStatus("📍 地名から座標を取得中...");
        const coords = await geocodeCity(prefecture, city);
        lat = coords.lat;
        lon = coords.lon;
      }

      setStatus("🌤️ 気候データを取得中（少し時間がかかります）...");
      const climateJuns = await fetchClimateFromAPI(lat, lon, parseInt(altitude));

      const locationData = {
        prefecture,
        city:       city.trim(),
        altitude:   parseInt(altitude),
        lat,
        lon,
        climateJuns,
      };

      setStatus("✅ 完了！");
      setTimeout(() => onComplete(locationData), 500);
    } catch(e) {
      setStatus(`❌ エラー: ${e.message}`);
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#1b4332 0%,#2d6a4f 55%,#40916c 100%)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ maxWidth:420, width:"100%" }}>
        {/* ロゴ */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:48, marginBottom:8 }}>🌱</div>
          <h1 style={{ margin:0, fontSize:24, fontWeight:900, color:"#fff", fontFamily:"'Noto Serif JP',serif" }}>協生農法 作物の森</h1>
          <p style={{ margin:"8px 0 0", fontSize:13, color:"rgba(255,255,255,0.75)" }}>あなたの畑の地域を登録してください</p>
        </div>

        {/* フォーム */}
        <div style={{ background:"rgba(255,255,255,0.97)", borderRadius:20, padding:"28px 24px", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
          <div style={{ marginBottom:18 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#555", marginBottom:6 }}>都道府県</label>
            <select value={prefecture} onChange={e => setPrefecture(e.target.value)}
              style={{ width:"100%", border:"1.5px solid #c8e6c9", borderRadius:10, padding:"10px 12px", fontSize:13, outline:"none", fontFamily:"inherit", background:"#fafff8", boxSizing:"border-box" }}>
              {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div style={{ marginBottom:18 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#555", marginBottom:6 }}>市区町村・地区名</label>
            <input value={city} onChange={e => setCity(e.target.value)}
              placeholder="例：飯綱町上村、八ヶ岳南麓..."
              style={{ width:"100%", border:"1.5px solid #c8e6c9", borderRadius:10, padding:"10px 12px", fontSize:13, outline:"none", fontFamily:"inherit", background:"#fafff8", boxSizing:"border-box" }} />
          </div>

          <div style={{ marginBottom:18 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#555", marginBottom:6 }}>
              標高（m）
              <span style={{ fontWeight:400, color:"#aaa", marginLeft:6 }}>※ 正確なほど精度が上がります</span>
            </label>
            <div style={{ display:"flex", gap:8 }}>
              <input value={altitude} onChange={e => setAltitude(e.target.value.replace(/[^0-9]/g,""))}
                placeholder="例：1000"
                type="number" min="0" max="3000"
                style={{ flex:1, border:"1.5px solid #c8e6c9", borderRadius:10, padding:"10px 12px", fontSize:13, outline:"none", fontFamily:"inherit", background:"#fafff8" }} />
              <button onClick={handleGPS} disabled={loading}
                style={{ padding:"10px 14px", borderRadius:10, border:"1.5px solid #c8e6c9", background:"#f0fdf4", color:"#2d6a4f", fontSize:12, fontWeight:700, cursor:loading?"wait":"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
                📍 GPS取得
              </button>
            </div>
          </div>

          {/* 標高の目安 */}
          <div style={{ background:"#f0fdf4", borderRadius:10, padding:"10px 14px", marginBottom:20, fontSize:11, color:"#555", lineHeight:1.8 }}>
            <div style={{ fontWeight:700, color:"#2d6a4f", marginBottom:4 }}>🏔️ 標高の目安</div>
            <div>平地（0〜200m）・丘陵（200〜600m）</div>
            <div>高原（600〜1200m）・亜高山（1200m〜）</div>
            <div style={{ color:"#888", marginTop:4 }}>標高100mごとに気温が約0.6℃低くなります</div>
          </div>

          {status && (
            <div style={{ marginBottom:16, padding:"10px 14px", borderRadius:10, background: status.startsWith("✅") ? "#f0fdf4" : status.startsWith("❌") ? "#fef2f2" : "#fffbeb", fontSize:12, fontWeight:600, color: status.startsWith("✅") ? "#2d6a4f" : status.startsWith("❌") ? "#dc2626" : "#92400e" }}>
              {status}
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading}
            style={{ width:"100%", padding:"14px", borderRadius:12, border:"none", background: loading ? "#aaa" : "linear-gradient(135deg,#1b4332,#2d6a4f)", color:"#fff", fontSize:15, fontWeight:900, cursor: loading ? "wait" : "pointer", fontFamily:"inherit", letterSpacing:1 }}>
            {loading ? "取得中..." : "🌱 この地域で始める"}
          </button>
        </div>

        <p style={{ textAlign:"center", marginTop:16, fontSize:11, color:"rgba(255,255,255,0.6)" }}>
          地域データはOpen-Meteo・国土地理院APIを使用しています
        </p>
      </div>
    </div>
  );
}

// ── AI作物追加パネル ─────────────────────────────────────────────────────
function buildAIPrompt(location) {
  // 初霜・終霜を気候データから推定
  const juns = location.climateJuns || [];
  const lastFrost = juns.filter(j => j.frost === true || j.frost === "risk")
    .filter(j => fromCode(j.code).m >= 3 && fromCode(j.code).m <= 6)
    .slice(-1)[0];
  const firstFrost = juns.filter(j => j.frost === true || j.frost === "risk")
    .filter(j => fromCode(j.code).m >= 9)
    .slice(0, 1)[0];

  const lastFrostLabel  = lastFrost  ? lastFrost.label  : "5月中旬";
  const firstFrostLabel = firstFrost ? firstFrost.label : "10月上旬";

  const summerAvg = juns.find(j => j.code === toCode(8,0))?.avgTemp ?? 22;
  const winterAvg = juns.find(j => j.code === toCode(1,1))?.avgTemp ?? -5;

  return `あなたは協生農法・パーマカルチャーの専門家です。
${location.prefecture}${location.city}（標高${location.altitude}m、夏平均気温約${summerAvg}℃、冬平均気温約${winterAvg}℃、終霜${lastFrostLabel}頃、初霜${firstFrostLabel}頃）の気候に合わせた作物データをJSON配列で返してください。

時期は必ず「月+旬」の形式で返してください。
例: "5中"=5月中旬, "9下"=9月下旬, "10上"=10月上旬

JSON形式のみで返してください（コードブロック不要）：
[{"name":"日本語名","en":"英名","category":"カテゴリ（野菜・葉物/野菜・実物/根菜・球根/果樹・木本類/ハーブ・薬草/穀物・豆類/高冷地特産のいずれか）","icon":"絵文字1文字","sowStartStr":"播種開始(例:5中)","sowEndStr":"播種終了(例:6上)","harvestStartStr":"収穫開始(例:8下)","harvestEndStr":"収穫終了(例:10上)","altitudeRating":標高適性1-5,"coldHardy":耐寒性true/false,"note":"この地域の気候に合わせた栽培メモ70字","layer":"草本層/低木層/亜高木層/高木層/地下層/つる植物のいずれか"}]`;
}

async function fetchCropData(userContent, location) {
  const prompt = buildAIPrompt(location);
  const res    = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key":    import.meta.env.VITE_ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-5",
      max_tokens: 1000,
      messages:   [{ role:"user", content: prompt + "\n\n" + userContent }],
    }),
  });
  const data   = await res.json();
  const text   = data.content?.map(b => b.text || "").join("") || "";
  const parsed = JSON.parse(text.replace(/```json?|```/g, "").trim());
  return parsed.map((c, i) => ({
    ...c,
    id:           "ai_" + Date.now() + "_" + i,
    sowStart:     parseJun(c.sowStartStr     || c.sowStart     || "5上"),
    sowEnd:       parseJun(c.sowEndStr       || c.sowEnd       || "6上"),
    harvestStart: parseJun(c.harvestStartStr || c.harvestStart || "8上"),
    harvestEnd:   parseJun(c.harvestEndStr   || c.harvestEnd   || "9上"),
  }));
}

function AIExpander({ onAdd, existingNames, location }) {
  const [open,        setOpen]        = useState(false);
  const [mode,        setMode]        = useState("single");
  const [singleInput, setSingleInput] = useState("");
  const [themeInput,  setThemeInput]  = useState("");
  const [loading,     setLoading]     = useState(false);
  const [status,      setStatus]      = useState("");
  const [preview,     setPreview]     = useState(null);

  const isDup = (name) => existingNames.has(name);

  const addSingle = async () => {
    const name = singleInput.trim();
    if (!name) return;
    if (isDup(name)) { setStatus(`⚠️「${name}」はすでに登録済みです`); return; }
    setLoading(true); setStatus(""); setPreview(null);
    try {
      const crops = await fetchCropData(`以下の作物を1種類だけ返してください（必ず1要素の配列で）:\n「${name}」`, location);
      setPreview(crops);
    } catch(e) { setStatus("❌ 生成失敗。再試行してください。"); }
    setLoading(false);
  };

  const addTheme = async () => {
    const theme = themeInput.trim();
    if (!theme) return;
    setLoading(true); setStatus(""); setPreview(null);
    try {
      const crops   = await fetchCropData(`以下のテーマに合う作物を5種類返してください:\n「${theme}」`, location);
      const newOnes = crops.filter(c => !isDup(c.name));
      if (newOnes.length === 0) { setStatus("⚠️ 該当する新しい作物が見つかりませんでした"); setLoading(false); return; }
      setPreview(newOnes);
    } catch(e) { setStatus("❌ 生成失敗。再試行してください。"); }
    setLoading(false);
  };

  const confirmAdd = () => {
    if (!preview) return;
    onAdd(preview);
    setStatus(`✅ ${preview.length}種を追加しました！`);
    setPreview(null);
    setSingleInput(""); setThemeInput("");
  };

  return (
    <div style={{ background:"#fff", borderRadius:14, overflow:"hidden", border:"1.5px solid #c8e6c9", marginBottom:12 }}>
      <button onClick={() => { setOpen(!open); setPreview(null); setStatus(""); }}
        style={{ width:"100%", padding:"12px 16px", background:"linear-gradient(135deg,#1b4332,#2d6a4f)", color:"#fff", border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:800, textAlign:"left", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span>🌱 作物を追加する</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding:"14px 16px" }}>
          <div style={{ display:"flex", gap:6, marginBottom:14 }}>
            {[{ id:"single", label:"🔍 作物名で1種追加" }, { id:"theme", label:"📦 テーマで5種追加" }].map(m => (
              <button key={m.id} onClick={() => { setMode(m.id); setPreview(null); setStatus(""); }}
                style={{ flex:1, padding:"8px 4px", borderRadius:10, border:"2px solid", borderColor:mode===m.id?"#2d6a4f":"#e0d8cc", background:mode===m.id?"#f0fdf4":"#fafafa", color:mode===m.id?"#1b4332":"#888", fontWeight:mode===m.id?800:400, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                {m.label}
              </button>
            ))}
          </div>

          {mode === "single" && (
            <div>
              <div style={{ fontSize:12, color:"#555", marginBottom:8, lineHeight:1.7 }}>
                追加したい作物名を入力してください。AIが<strong>{location.prefecture}{location.city}（標高{location.altitude}m）</strong>の気候に合わせたデータを生成します。
              </div>
              <div style={{ display:"flex", gap:8, marginBottom:6 }}>
                <input value={singleInput} onChange={e => setSingleInput(e.target.value)}
                  onKeyDown={e => e.key==="Enter" && addSingle()}
                  placeholder="例：オカヒジキ、クコ、山椒..."
                  style={{ flex:1, border:"1.5px solid #c8e6c9", borderRadius:8, padding:"9px 12px", fontSize:13, outline:"none", fontFamily:"inherit", background:"#fafff8" }} />
                <button onClick={addSingle} disabled={loading || !singleInput.trim()}
                  style={{ padding:"9px 18px", borderRadius:8, border:"none", background:loading?"#aaa":"#1b4332", color:"#fff", fontWeight:700, cursor:loading?"wait":"pointer", fontSize:13, fontFamily:"inherit", whiteSpace:"nowrap" }}>
                  {loading ? "生成中..." : "検索・追加"}
                </button>
              </div>
            </div>
          )}

          {mode === "theme" && (
            <div>
              <div style={{ fontSize:12, color:"#555", marginBottom:8, lineHeight:1.7 }}>
                テーマやジャンルを入力すると、<strong>{location.prefecture}{location.city}</strong>の気候に合った作物を5種まとめて追加します。
              </div>
              <div style={{ display:"flex", gap:8, marginBottom:6 }}>
                <input value={themeInput} onChange={e => setThemeInput(e.target.value)}
                  onKeyDown={e => e.key==="Enter" && addTheme()}
                  placeholder="例：山菜、薬用植物、蜜源植物..."
                  style={{ flex:1, border:"1.5px solid #c8e6c9", borderRadius:8, padding:"9px 12px", fontSize:13, outline:"none", fontFamily:"inherit", background:"#fafff8" }} />
                <button onClick={addTheme} disabled={loading || !themeInput.trim()}
                  style={{ padding:"9px 18px", borderRadius:8, border:"none", background:loading?"#aaa":"#1b4332", color:"#fff", fontWeight:700, cursor:loading?"wait":"pointer", fontSize:13, fontFamily:"inherit", whiteSpace:"nowrap" }}>
                  {loading ? "生成中..." : "追加"}
                </button>
              </div>
            </div>
          )}

          {status && !preview && (
            <div style={{ marginTop:10, fontSize:12, fontWeight:600, color:status.startsWith("✅")?"#2d6a4f":status.startsWith("⚠️")?"#92400e":"#c00" }}>
              {status}
            </div>
          )}

          {preview && (
            <div style={{ marginTop:12, border:"1.5px solid #a8d5b5", borderRadius:12, overflow:"hidden" }}>
              <div style={{ background:"#f0fdf4", padding:"8px 14px", fontSize:12, fontWeight:700, color:"#1b4332", borderBottom:"1px solid #c8e6c9" }}>
                📋 追加内容を確認してください（{preview.length}種）
              </div>
              {preview.map((c, i) => {
                const cat = CAT_COLORS[c.category] || CAT_COLORS["野菜・葉物"];
                return (
                  <div key={i} style={{ padding:"10px 14px", borderBottom:i<preview.length-1?"1px solid #e8f5ee":"none", background:"#fff" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:18 }}>{c.icon}</span>
                      <div>
                        <span style={{ fontWeight:800, fontSize:13, color:cat.accent }}>{c.name}</span>
                        <span style={{ fontSize:11, color:"#aaa", marginLeft:6 }}>{c.en}</span>
                      </div>
                      <span style={{ marginLeft:"auto", fontSize:10, background:cat.bg, color:cat.accent, border:`1px solid ${cat.dot}50`, borderRadius:10, padding:"1px 7px" }}>{c.category}</span>
                    </div>
                    <div style={{ fontSize:11, color:"#666", lineHeight:1.6, marginBottom:4 }}>{c.note}</div>
                    <div style={{ fontSize:10, color:"#aaa" }}>
                      🌱 {codeToLabel(c.sowStart)}〜{codeToLabel(c.sowEnd)} ／ 🧺 {codeToLabel(c.harvestStart)}〜{codeToLabel(c.harvestEnd)}
                    </div>
                  </div>
                );
              })}
              <div style={{ display:"flex", gap:8, padding:"10px 14px", background:"#f0fdf4" }}>
                <button onClick={confirmAdd}
                  style={{ flex:2, padding:"9px", borderRadius:8, border:"none", background:"#1b4332", color:"#fff", fontWeight:800, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
                  ✅ この内容で追加する
                </button>
                <button onClick={() => { setPreview(null); setStatus(""); }}
                  style={{ flex:1, padding:"9px", borderRadius:8, border:"1px solid #ccc", background:"#fff", color:"#888", fontWeight:600, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                  キャンセル
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── メインアプリ ─────────────────────────────────────────────────────────
export default function App() {
  const nowCode = currentJunCode();
  const { m: nowM, j: nowJ } = fromCode(nowCode);

  const [location,     setLocation]     = useState(null);   // null = 未設定
  const [crops,        setCrops]        = useState([]);
  const [view,         setView]         = useState("today");
  const [selectedCode, setSelectedCode] = useState(nowCode);
  const [selectedCat,  setSelectedCat]  = useState("すべて");
  const [search,       setSearch]       = useState("");
  const [expandedId,   setExpandedId]   = useState(null);
  const [filterAlt,    setFilterAlt]    = useState(false);
  const cropsCache = useRef(null);

  // localStorageからデータ復元
  useEffect(() => {
    try {
      const savedLoc   = localStorage.getItem("kyosei_location");
      const savedCrops = JSON.parse(localStorage.getItem("kyosei_crops") || "[]");
      if (savedLoc) setLocation(JSON.parse(savedLoc));
      if (Array.isArray(savedCrops) && savedCrops.length > 0) setCrops(savedCrops);
    } catch(e) {}
  }, []);

  // location保存
  useEffect(() => {
    if (location) {
      try { localStorage.setItem("kyosei_location", JSON.stringify(location)); } catch(e) {}
    }
  }, [location]);

  // crops保存
  useEffect(() => {
    const json = JSON.stringify(crops);
    if (cropsCache.current === json) return;
    cropsCache.current = json;
    try { localStorage.setItem("kyosei_crops", json); } catch(e) {}
  }, [crops]);

  const addCrops = (nc) => {
    setCrops(prev => {
      const names   = new Set(prev.map(c => c.name));
      const newOnes = nc.filter(c => !names.has(c.name));
      return newOnes.length === 0 ? prev : [...prev, ...newOnes];
    });
  };

  const handleLocationComplete = (locationData) => {
    setLocation(locationData);
    setCrops([]);
  };

  const handleReset = () => {
    if (!confirm("地域設定と作物データをリセットしますか？")) return;
    localStorage.removeItem("kyosei_location");
    localStorage.removeItem("kyosei_crops");
    setLocation(null);
    setCrops([]);
  };

  // 未設定なら地域登録画面
  if (!location) return <LocationSetup onComplete={handleLocationComplete} />;

  const climateJuns = location.climateJuns || [];
  const getClimate  = (code) => climateJuns.find(c => c.code === code) || { label:codeToLabel(code), avgTemp:10, minTemp:5, frost:false, snow:false, work:"" };
  const climate     = getClimate(selectedCode);
  const nowClimate  = getClimate(nowCode);

  const todaySow     = crops.filter(c => inRange(nowCode, c.sowStart, c.sowEnd));
  const todayHarvest = crops.filter(c => inRange(nowCode, c.harvestStart, c.harvestEnd));

  const filtered = useMemo(() => crops.filter(c => {
    if (selectedCat !== "すべて" && c.category !== selectedCat) return false;
    if (filterAlt && (c.altitudeRating || 3) < 4) return false;
    if (search && !c.name.includes(search) && !c.en?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [crops, selectedCat, search, filterAlt]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const aA = inRange(selectedCode, a.sowStart, a.sowEnd) || inRange(selectedCode, a.harvestStart, a.harvestEnd);
    const bA = inRange(selectedCode, b.sowStart, b.sowEnd) || inRange(selectedCode, b.harvestStart, b.harvestEnd);
    if (bA !== aA) return bA - aA;
    return (b.altitudeRating || 3) - (a.altitudeRating || 3);
  }), [filtered, selectedCode]);

  const JunSelector = () => (
    <div style={{ background:"#fff", borderRadius:12, padding:"10px 12px", marginBottom:10, border:"1px solid #e0d8cc", overflowX:"auto" }}>
      <div style={{ fontSize:11, color:"#888", marginBottom:6, fontWeight:600 }}>旬を選択</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(12, 1fr)", gap:3, minWidth:320 }}>
        {Array.from({ length:12 }, (_, mi) => {
          const m = mi + 1;
          return (
            <div key={m}>
              <div style={{ fontSize:9, color:"#aaa", textAlign:"center", marginBottom:2 }}>{m}月</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:2 }}>
                {[0,1,2].map(j => {
                  const code  = toCode(m, j);
                  const isSel = selectedCode === code;
                  const isNow = nowCode === code;
                  const cl    = getClimate(code);
                  const frost = cl?.frost;
                  return (
                    <button key={j} onClick={() => setSelectedCode(code)} title={codeToLabel(code)} style={{
                      padding:"3px 0", borderRadius:4, border:isNow?"2px solid #2d6a4f":"1px solid #ddd",
                      background:isSel?"#2d6a4f":frost===true?"#dbeafe":frost==="risk"?"#fef9c3":"#fff",
                      color:isSel?"#fff":frost===true?"#3b82f6":"#555",
                      fontSize:9, cursor:"pointer", fontWeight:isSel||isNow?800:400, fontFamily:"inherit", lineHeight:1.2,
                    }}>
                      {JSHORT[j]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display:"flex", gap:10, marginTop:8, fontSize:10, color:"#aaa" }}>
        <span style={{ display:"flex", alignItems:"center", gap:3 }}><span style={{ width:10, height:10, background:"#dbeafe", borderRadius:2, display:"inline-block" }}/>霜あり</span>
        <span style={{ display:"flex", alignItems:"center", gap:3 }}><span style={{ width:10, height:10, background:"#fef9c3", borderRadius:2, display:"inline-block" }}/>霜リスク</span>
        <span style={{ display:"flex", alignItems:"center", gap:3 }}><span style={{ width:10, height:10, background:"#fff", border:"2px solid #2d6a4f", borderRadius:2, display:"inline-block" }}/>今</span>
      </div>
    </div>
  );

  const ClimateCard = ({ code }) => {
    const cl = getClimate(code);
    if (!cl) return null;
    const frostColor = cl.frost===true?"#3b82f6":cl.frost==="risk"?"#f59e0b":"#10b981";
    const frostLabel = cl.frost===true?"❄️ 霜あり":cl.frost==="risk"?"⚠️ 霜リスク":"✅ 霜なし";
    return (
      <div style={{ background:"#fff", borderRadius:12, padding:"10px 14px", border:"1px solid #e0d8cc", marginBottom:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
          <span style={{ fontWeight:800, fontSize:14, color:"#1b4332" }}>{cl.label}</span>
          <span style={{ background:frostColor+"15", color:frostColor, border:`1px solid ${frostColor}40`, borderRadius:10, padding:"2px 8px", fontWeight:700, fontSize:11 }}>{frostLabel}</span>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:8 }}>
          <div style={{ background:"#fef9f0", borderRadius:8, padding:"5px 8px", textAlign:"center" }}>
            <div style={{ fontSize:9, color:"#999" }}>平均</div>
            <div style={{ fontWeight:800, color:"#d97706", fontSize:14 }}>{cl.avgTemp}℃</div>
          </div>
          <div style={{ background:"#eff6ff", borderRadius:8, padding:"5px 8px", textAlign:"center" }}>
            <div style={{ fontSize:9, color:"#999" }}>最低</div>
            <div style={{ fontWeight:800, color:"#3b82f6", fontSize:14 }}>{cl.minTemp}℃</div>
          </div>
          <div style={{ background:cl.snow?"#f0f4ff":"#f9fafb", borderRadius:8, padding:"5px 8px", textAlign:"center" }}>
            <div style={{ fontSize:9, color:"#999" }}>積雪</div>
            <div style={{ fontWeight:800, color:cl.snow?"#6366f1":"#aaa", fontSize:14 }}>{cl.snow?"あり":"なし"}</div>
          </div>
        </div>
        {cl.work && <div style={{ fontSize:12, color:"#555", lineHeight:1.7 }}>🗓️ {cl.work}</div>}
      </div>
    );
  };

  return (
    <div style={{ minHeight:"100vh", background:"#f0ece3", fontFamily:"'Noto Serif JP','Georgia',serif", color:"#2c2c1e" }}>
      {/* Header */}
      <div style={{ background:"linear-gradient(160deg,#1b4332 0%,#2d6a4f 55%,#40916c 100%)", padding:"20px 18px 14px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-30, right:-30, width:160, height:160, borderRadius:"50%", background:"rgba(255,255,255,0.05)" }}/>
        <div style={{ position:"relative", zIndex:1 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
              <span style={{ fontSize:22 }}>🏔️</span>
              <h1 style={{ margin:0, fontSize:18, fontWeight:900, color:"#fff", letterSpacing:1 }}>協生農法 作物の森</h1>
            </div>
            <button onClick={handleReset}
              style={{ background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.3)", borderRadius:8, padding:"4px 10px", color:"rgba(255,255,255,0.8)", fontSize:10, cursor:"pointer", fontFamily:"inherit" }}>
              📍 地域変更
            </button>
          </div>
          <p style={{ margin:"2px 0 6px", fontSize:11, color:"rgba(255,255,255,0.8)" }}>
            📍 {location.prefecture}{location.city} 標高{location.altitude}m ／ {crops.length}種 ／ 目標1,000種
          </p>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.9)", fontWeight:600 }}>
            現在：{nowM}月{JNAME[nowJ]}
            <span style={{ marginLeft:8, fontSize:11, fontWeight:400, color:"rgba(255,255,255,0.7)" }}>
              {nowClimate.frost===true?"❄️ 霜あり":nowClimate.frost==="risk"?"⚠️ 霜リスク":"✅ 霜なし"} / {nowClimate.avgTemp}℃
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ display:"flex", borderBottom:"2px solid #ddd", background:"#faf8f3" }}>
        {[{ id:"today", label:"今の旬", icon:"📅" }, { id:"calendar", label:"旬カレンダー", icon:"🗓" }].map(tab => (
          <button key={tab.id} onClick={() => setView(tab.id)} style={{ flex:1, padding:"12px 4px", border:"none", background:"none", cursor:"pointer", fontSize:13, fontWeight:view===tab.id?800:500, color:view===tab.id?"#2d6a4f":"#888", borderBottom:view===tab.id?"3px solid #2d6a4f":"3px solid transparent", fontFamily:"inherit" }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth:720, margin:"0 auto", padding:"12px 12px 40px" }}>
        <AIExpander onAdd={addCrops} existingNames={new Set(crops.map(c => c.name))} location={location} />

        {/* 作物が0件のときのガイド */}
        {crops.length === 0 && (
          <div style={{ background:"#fff", borderRadius:14, padding:"24px 20px", textAlign:"center", border:"1.5px dashed #c8e6c9", marginBottom:12 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🌱</div>
            <div style={{ fontWeight:800, fontSize:15, color:"#1b4332", marginBottom:8 }}>まだ作物が登録されていません</div>
            <div style={{ fontSize:13, color:"#666", lineHeight:1.8 }}>
              上の「作物を追加する」から<br/>
              <strong>{location.prefecture}{location.city}（標高{location.altitude}m）</strong><br/>
              に合った作物をAIで生成してください。
            </div>
          </div>
        )}

        {/* TODAY */}
        {view === "today" && crops.length > 0 && (
          <div>
            <ClimateCard code={nowCode} />
            {nowClimate.frost === true && (
              <div style={{ background:"#eff6ff", border:"1.5px solid #93c5fd", borderRadius:12, padding:"10px 14px", marginBottom:10, fontSize:12, color:"#1d4ed8" }}>
                ❄️ <strong>霜・積雪期間中</strong> — 屋外定植は不可。ハウス・室内での育苗・管理が必要です。
              </div>
            )}
            {nowClimate.frost === "risk" && (
              <div style={{ background:"#fffbeb", border:"1.5px solid #fbbf24", borderRadius:12, padding:"10px 14px", marginBottom:10, fontSize:12, color:"#92400e" }}>
                ⚠️ <strong>霜リスク期間</strong> — 耐寒性のない苗の屋外定植は控えてください。
              </div>
            )}

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
              <div style={{ background:"#f0fdf4", borderRadius:12, padding:"12px", border:"1px solid #a8d5b5", textAlign:"center" }}>
                <div style={{ fontSize:11, color:"#2d6a4f", fontWeight:700 }}>🌱 播種・植樹</div>
                <div style={{ fontSize:26, fontWeight:900, color:"#1b5e20" }}>{todaySow.length}<span style={{ fontSize:12, fontWeight:400 }}>種</span></div>
              </div>
              <div style={{ background:"#fff7ed", borderRadius:12, padding:"12px", border:"1px solid #fbc89e", textAlign:"center" }}>
                <div style={{ fontSize:11, color:"#9c4221", fontWeight:700 }}>🧺 収穫</div>
                <div style={{ fontSize:26, fontWeight:900, color:"#9c4221" }}>{todayHarvest.length}<span style={{ fontSize:12, fontWeight:400 }}>種</span></div>
              </div>
            </div>

            {[{ type:"播種・植樹", list:todaySow, icon:"🌱", c:"#2d6a4f" }, { type:"収穫", list:todayHarvest, icon:"🧺", c:"#9c4221" }].map(({ type, list, icon, c }) => (
              <div key={type} style={{ marginBottom:16 }}>
                <h3 style={{ margin:"0 0 8px", fontSize:13, fontWeight:800, color:c }}>{icon} {type}適期（{list.length}種）</h3>
                <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                  {list.map(crop => {
                    const cat  = CAT_COLORS[crop.category] || CAT_COLORS["野菜・葉物"];
                    const isEx = expandedId === crop.id;
                    return (
                      <div key={crop.id} onClick={() => setExpandedId(isEx ? null : crop.id)} style={{ background:cat.bg, borderRadius:12, padding:"11px 14px", cursor:"pointer", border:`1px solid ${cat.dot}50` }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <span style={{ fontSize:20 }}>{crop.icon}</span>
                            <div>
                              <div style={{ fontWeight:800, fontSize:14, color:cat.accent }}>{crop.name}</div>
                              <div style={{ display:"flex", gap:4, marginTop:2 }}>
                                <span style={{ fontSize:10, color:"#aaa" }}>{crop.category}</span>
                                <AltBadge rating={crop.altitudeRating || 3} />
                              </div>
                            </div>
                          </div>
                          <span style={{ fontSize:11, color:"#aaa" }}>{isEx ? "▲" : "▼"}</span>
                        </div>
                        <div style={{ marginTop:4 }}>
                          <div style={{ fontSize:9, color:"#aaa", marginBottom:2 }}>🌱 播種期</div>
                          <JunBar startCode={crop.sowStart} endCode={crop.sowEnd} color={cat.dot} currentCode={nowCode} />
                        </div>
                        {isEx && (
                          <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${cat.dot}30`, fontSize:12, color:"#555", lineHeight:1.8 }}>
                            <div style={{ marginBottom:6 }}>{crop.note}</div>
                            <div style={{ fontSize:11, color:"#888" }}>🌱 播種: {codeToLabel(crop.sowStart)}〜{codeToLabel(crop.sowEnd)}</div>
                            <div style={{ fontSize:11, color:"#888" }}>🧺 収穫: {codeToLabel(crop.harvestStart)}〜{codeToLabel(crop.harvestEnd)}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CALENDAR */}
        {view === "calendar" && crops.length > 0 && (
          <div>
            <JunSelector />
            <ClimateCard code={selectedCode} />

            <div style={{ background:"#fff", borderRadius:12, padding:"10px 12px", marginBottom:10, border:"1px solid #e0d8cc" }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 作物名で検索..."
                style={{ width:"100%", border:"1px solid #ddd", borderRadius:8, padding:"6px 10px", fontSize:12, outline:"none", marginBottom:8, boxSizing:"border-box", fontFamily:"inherit" }} />
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:8 }}>
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setSelectedCat(cat)} style={{ padding:"3px 8px", borderRadius:20, border:"1.5px solid", borderColor:selectedCat===cat?"#2d6a4f":"#ccc", background:selectedCat===cat?"#2d6a4f":"#fff", color:selectedCat===cat?"#fff":"#666", fontSize:11, cursor:"pointer", fontFamily:"inherit", fontWeight:selectedCat===cat?700:400 }}>{cat}</button>
                ))}
              </div>
              <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, cursor:"pointer", color:"#2d6a4f", fontWeight:600 }}>
                <input type="checkbox" checked={filterAlt} onChange={e => setFilterAlt(e.target.checked)} style={{ accentColor:"#2d6a4f" }}/>
                標高適性「良好」以上のみ
              </label>
            </div>

            <div style={{ fontSize:11, color:"#888", marginBottom:6 }}>{sorted.length}種 ／ 旬の適期順</div>

            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {sorted.map(c => {
                const cat       = CAT_COLORS[c.category] || CAT_COLORS["野菜・葉物"];
                const isSow     = inRange(selectedCode, c.sowStart, c.sowEnd);
                const isHarvest = inRange(selectedCode, c.harvestStart, c.harvestEnd);
                const active    = isSow || isHarvest;
                const isEx      = expandedId === c.id;
                return (
                  <div key={c.id} onClick={() => setExpandedId(isEx ? null : c.id)} style={{ background:active?cat.bg:"#faf8f3", borderRadius:12, padding:"11px 13px", cursor:"pointer", border:active?`1.5px solid ${cat.dot}60`:"1.5px solid #e8e2d8", opacity:active?1:0.7, boxShadow:active?`0 2px 8px ${cat.dot}18`:"none", transition:"all 0.15s" }}>
                    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:8 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                        <span style={{ fontSize:20 }}>{c.icon}</span>
                        <div>
                          <div style={{ fontWeight:800, fontSize:13, color:active?cat.accent:"#555" }}>{c.name}</div>
                          <div style={{ display:"flex", gap:4, marginTop:2, flexWrap:"wrap" }}>
                            <span style={{ fontSize:10, color:"#aaa" }}>{c.category}</span>
                            <AltBadge rating={c.altitudeRating || 3} />
                            {c.coldHardy && <span style={{ fontSize:10, color:"#3b82f6", background:"#eff6ff", borderRadius:8, padding:"1px 5px", border:"1px solid #bfdbfe" }}>耐寒✓</span>}
                          </div>
                        </div>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:3, alignItems:"flex-end" }}>
                        {isSow     && <span style={{ fontSize:10, background:"#f0fdf4", color:"#4caf50", border:"1px solid #4caf50", borderRadius:10, padding:"1px 7px", fontWeight:700, whiteSpace:"nowrap" }}>🌱 播種期</span>}
                        {isHarvest && <span style={{ fontSize:10, background:"#fff7ed", color:"#e07b39", border:"1px solid #e07b39", borderRadius:10, padding:"1px 7px", fontWeight:700, whiteSpace:"nowrap" }}>🧺 収穫期</span>}
                      </div>
                    </div>
                    <div style={{ marginBottom:isEx?10:0 }}>
                      <div style={{ fontSize:9, color:"#aaa", marginBottom:2 }}>🌱 播種・植樹</div>
                      <JunBarWithLabels startCode={c.sowStart} endCode={c.sowEnd} color={cat.dot} currentCode={selectedCode} />
                      <div style={{ fontSize:9, color:"#aaa", margin:"6px 0 2px" }}>🧺 収穫</div>
                      <JunBarWithLabels startCode={c.harvestStart} endCode={c.harvestEnd} color="#e07b39" currentCode={selectedCode} />
                    </div>
                    {isEx && (
                      <div style={{ paddingTop:10, borderTop:`1px solid ${cat.dot}30`, fontSize:12, color:"#555", lineHeight:1.8 }}>
                        🏔️ {c.note}
                        <div style={{ marginTop:6, display:"flex", gap:12, flexWrap:"wrap", fontSize:11, color:"#888" }}>
                          <span>播種: {codeToLabel(c.sowStart)} 〜 {codeToLabel(c.sowEnd)}</span>
                          <span>収穫: {codeToLabel(c.harvestStart)} 〜 {codeToLabel(c.harvestEnd)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
