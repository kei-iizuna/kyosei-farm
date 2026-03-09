import { useState, useMemo, useEffect, useRef } from "react";

// ── ユーティリティ: 旬の変換 ─────────────────────────────────────────────
// 旬コード = 月 * 3 + (0=上旬, 1=中旬, 2=下旬)  例: 5月中旬 = 5*3+1 = 16
const toCode  = (m, j) => m * 3 + j;           // j: 0=上,1=中,2=下
const fromCode = (code) => ({ m: Math.floor(code / 3), j: code % 3 });
const JNAME   = ["上旬", "中旬", "下旬"];
const JSHORT  = ["上", "中", "下"];

// 文字列 "5中" → コード変換
function parseJun(str) {
  // str = "5上" | "5中" | "5下" | 数値(旧形式)
  if (typeof str === "number") return str * 3; // 旧形式: 月の上旬扱い
  const m = parseInt(str);
  const j = str.includes("下") ? 2 : str.includes("中") ? 1 : 0;
  return toCode(m, j);
}

// コード → 表示文字列
function codeToLabel(code) {
  const { m, j } = fromCode(code);
  return `${m}月${JNAME[j]}`;
}

// コード範囲チェック（年またぎ対応）
function inRange(code, startCode, endCode) {
  if (startCode <= endCode) return code >= startCode && code <= endCode;
  return code >= startCode || code <= endCode;
}

// 現在の旬コード
function currentJunCode() {
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const j = d <= 10 ? 0 : d <= 20 ? 1 : 2;
  return toCode(m, j);
}

// ── 気候データ（旬単位） ─────────────────────────────────────────────────
// code: 旬コード, frost: true/false/"risk", work: この旬にできること
const CLIMATE_JUNS = [
  // 1月
  {code:toCode(1,0),label:"1月上旬",avgTemp:-5,minTemp:-12,frost:true, snow:true, work:"屋内計画・種の選定。積雪60〜90cm。"},
  {code:toCode(1,1),label:"1月中旬",avgTemp:-5,minTemp:-12,frost:true, snow:true, work:"農具のメンテナンス。土壌分析の検討。"},
  {code:toCode(1,2),label:"1月下旬",avgTemp:-4,minTemp:-11,frost:true, snow:true, work:"種苗カタログで来季計画。堆肥の仕込み（室内）。"},
  // 2月
  {code:toCode(2,0),label:"2月上旬",avgTemp:-4,minTemp:-11,frost:true, snow:true, work:"まだ厳冬。育苗ハウスの準備開始。"},
  {code:toCode(2,1),label:"2月中旬",avgTemp:-3,minTemp:-10,frost:true, snow:true, work:"ハウス内の加温準備。早生トマト・ナスの播種（ハウス内）。"},
  {code:toCode(2,2),label:"2月下旬",avgTemp:-2,minTemp:-9, frost:true, snow:true, work:"ハウス内でトマト・ナス・ピーマンの育苗開始。"},
  // 3月
  {code:toCode(3,0),label:"3月上旬",avgTemp: 0,minTemp:-7, frost:true, snow:true, work:"ハウス育苗継続。屋外はまだ雪あり。"},
  {code:toCode(3,1),label:"3月中旬",avgTemp: 2,minTemp:-6, frost:true, snow:true, work:"レタス・キャベツのハウス播種。雪解け始まる場所も。"},
  {code:toCode(3,2),label:"3月下旬",avgTemp: 4,minTemp:-4, frost:true, snow:false,work:"ハウス内でレタス・春菊の播種。果樹の剪定開始。"},
  // 4月
  {code:toCode(4,0),label:"4月上旬",avgTemp: 6,minTemp:-2, frost:true, snow:false,work:"ハウス内播種継続。屋外は遅霜あり。果樹剪定・施肥。"},
  {code:toCode(4,1),label:"4月中旬",avgTemp: 8,minTemp: 0, frost:true, snow:false,work:"霜リスクあり。ハウス内でのみ定植可。ジャガイモ準備。"},
  {code:toCode(4,2),label:"4月下旬",avgTemp:10,minTemp: 1, frost:"risk",snow:false,work:"⚠️ まだ遅霜の危険。耐寒性高い葉物はトンネル播種可。"},
  // 5月
  {code:toCode(5,0),label:"5月上旬",avgTemp:12,minTemp: 3, frost:"risk",snow:false,work:"⚠️ 霜リスク残る。ジャガイモ植え付け開始。耐寒葉物の定植。"},
  {code:toCode(5,1),label:"5月中旬",avgTemp:14,minTemp: 5, frost:"risk",snow:false,work:"⚠️ 中旬まで霜注意。キャベツ・ブロッコリー定植可（不織布保護）。"},
  {code:toCode(5,2),label:"5月下旬",avgTemp:16,minTemp: 7, frost:false,snow:false,work:"✅ 霜の心配ほぼ解消。夏野菜（トマト・キュウリ等）の定植開始！"},
  // 6月
  {code:toCode(6,0),label:"6月上旬",avgTemp:17,minTemp: 9, frost:false,snow:false,work:"夏野菜の定植・播種本番。梅雨入り前に作業を進める。"},
  {code:toCode(6,1),label:"6月中旬",avgTemp:18,minTemp:10, frost:false,snow:false,work:"梅雨期。ダイコン・ニンジンの夏蒔き。ソバの播種。"},
  {code:toCode(6,2),label:"6月下旬",avgTemp:19,minTemp:11, frost:false,snow:false,work:"初収穫始まる（葉物・ハーブ）。追肥・支柱立て。"},
  // 7月
  {code:toCode(7,0),label:"7月上旬",avgTemp:20,minTemp:12, frost:false,snow:false,work:"トマト・キュウリ収穫始まる。夏野菜の管理。"},
  {code:toCode(7,1),label:"7月中旬",avgTemp:21,minTemp:13, frost:false,snow:false,work:"秋野菜の播種準備。ブルーベリー・ラズベリー収穫。"},
  {code:toCode(7,2),label:"7月下旬",avgTemp:22,minTemp:14, frost:false,snow:false,work:"白菜・キャベツの秋蒔き播種。夏野菜収穫最盛期。"},
  // 8月
  {code:toCode(8,0),label:"8月上旬",avgTemp:22,minTemp:14, frost:false,snow:false,work:"夏収穫最盛期。秋野菜の育苗継続。ジャガイモ収穫。"},
  {code:toCode(8,1),label:"8月中旬",avgTemp:21,minTemp:13, frost:false,snow:false,work:"タマネギ・ニンニクの播種準備。ソバの生育確認。"},
  {code:toCode(8,2),label:"8月下旬",avgTemp:20,minTemp:12, frost:false,snow:false,work:"秋野菜の定植（白菜・キャベツ）。秋の準備本番。"},
  // 9月
  {code:toCode(9,0),label:"9月上旬",avgTemp:18,minTemp:10, frost:false,snow:false,work:"秋野菜の生育旺盛。タマネギの播種。ソバ収穫近し。"},
  {code:toCode(9,1),label:"9月中旬",avgTemp:16,minTemp: 9, frost:false,snow:false,work:"ニンニク植え付け開始。秋収穫（ダイコン・ニンジン）始まる。"},
  {code:toCode(9,2),label:"9月下旬",avgTemp:14,minTemp: 7, frost:"risk",snow:false,work:"⚠️ 初霜が近い！霜に弱い作物の収穫を急ぐ。ソバ収穫。"},
  // 10月
  {code:toCode(10,0),label:"10月上旬",avgTemp:11,minTemp: 3, frost:"risk",snow:false,work:"🚨 初霜の危険！トマト・ナス・キュウリを急いで収穫。"},
  {code:toCode(10,1),label:"10月中旬",avgTemp: 9,minTemp: 1, frost:true, snow:false,work:"❄️ 霜あり。耐寒作物（白菜・カブ）はまだ収穫可能。"},
  {code:toCode(10,2),label:"10月下旬",avgTemp: 7,minTemp:-1, frost:true, snow:false,work:"越冬野菜の保温管理。根菜の収穫急ぐ。"},
  // 11月
  {code:toCode(11,0),label:"11月上旬",avgTemp: 5,minTemp:-2, frost:true, snow:false,work:"霜・初雪の可能性。耐寒葉物はトンネルで管理。"},
  {code:toCode(11,1),label:"11月中旬",avgTemp: 3,minTemp:-4, frost:true, snow:true, work:"積雪開始。収穫の締めくくり。堆肥仕込み。"},
  {code:toCode(11,2),label:"11月下旬",avgTemp: 1,minTemp:-6, frost:true, snow:true, work:"本格的な冬支度。マルチ・不織布で越冬野菜保護。"},
  // 12月
  {code:toCode(12,0),label:"12月上旬",avgTemp:-1,minTemp:-7, frost:true, snow:true, work:"積雪。ハウス管理のみ。"},
  {code:toCode(12,1),label:"12月中旬",avgTemp:-2,minTemp:-8, frost:true, snow:true, work:"厳冬準備。来年の計画立案開始。"},
  {code:toCode(12,2),label:"12月下旬",avgTemp:-3,minTemp:-9, frost:true, snow:true, work:"農閑期。農具・施設の冬季メンテナンス。"},
];

const getClimate = (code) => CLIMATE_JUNS.find(c => c.code === code) || CLIMATE_JUNS[0];

// ── 作物データ（旬単位） ─────────────────────────────────────────────────
// sowStart/sowEnd/harvestStart/harvestEnd は旬コード
const CROPS = [
  // 野菜・葉物
  {id:"v001",name:"コマツナ",en:"Komatsuna",category:"野菜・葉物",icon:"🥬",
   sowStart:toCode(5,1),sowEnd:toCode(8,2),harvestStart:toCode(6,0),harvestEnd:toCode(10,1),
   altitudeRating:5,coldHardy:true,note:"5月中旬以降に直播き。生育旺盛で繰り返し収穫。秋はトンネルで10月中旬まで延長可。",layer:"草本層"},
  {id:"v002",name:"ホウレンソウ",en:"Spinach",category:"野菜・葉物",icon:"🌿",
   sowStart:toCode(5,1),sowEnd:toCode(8,1),harvestStart:toCode(6,1),harvestEnd:toCode(10,0),
   altitudeRating:5,coldHardy:true,note:"5月中旬〜夏まで随時播種。高冷地の夏ホウレンソウは絶品。秋は10月上旬まで。",layer:"草本層"},
  {id:"v003",name:"ルッコラ",en:"Arugula",category:"野菜・葉物",icon:"🥗",
   sowStart:toCode(5,1),sowEnd:toCode(8,1),harvestStart:toCode(6,0),harvestEnd:toCode(10,0),
   altitudeRating:5,coldHardy:true,note:"5月中旬から播種。高冷地で風味が濃厚。2〜3週間で収穫できる。",layer:"草本層"},
  {id:"v004",name:"レタス",en:"Lettuce",category:"野菜・葉物",icon:"🥬",
   sowStart:toCode(3,1),sowEnd:toCode(7,0),harvestStart:toCode(5,2),harvestEnd:toCode(9,0),
   altitudeRating:5,coldHardy:false,note:"3月中旬からハウス播種。5月下旬以降に屋外定植。夏の高冷地レタスは全国ブランド品質。",layer:"草本層"},
  {id:"v005",name:"ケール",en:"Kale",category:"野菜・葉物",icon:"🌱",
   sowStart:toCode(5,1),sowEnd:toCode(7,0),harvestStart:toCode(7,0),harvestEnd:toCode(11,0),
   altitudeRating:5,coldHardy:true,note:"5月中旬以降播種。霜に当たると甘みが増す。10月以降も収穫可能な高冷地向き優秀野菜。",layer:"草本層"},
  {id:"v006",name:"ミズナ",en:"Mizuna",category:"野菜・葉物",icon:"🌿",
   sowStart:toCode(5,1),sowEnd:toCode(8,1),harvestStart:toCode(6,0),harvestEnd:toCode(10,1),
   altitudeRating:5,coldHardy:true,note:"5月中旬から随時播種。生育旺盛。高冷地では特に品質が高い。",layer:"草本層"},
  {id:"v007",name:"チンゲンサイ",en:"Bok choy",category:"野菜・葉物",icon:"🥦",
   sowStart:toCode(5,1),sowEnd:toCode(8,1),harvestStart:toCode(6,0),harvestEnd:toCode(10,0),
   altitudeRating:4,coldHardy:true,note:"5月中旬以降に播種。成長が早く初心者向き。",layer:"草本層"},
  {id:"v008",name:"シソ（大葉）",en:"Shiso",category:"野菜・葉物",icon:"🍃",
   sowStart:toCode(5,2),sowEnd:toCode(6,0),harvestStart:toCode(7,0),harvestEnd:toCode(9,1),
   altitudeRating:4,coldHardy:false,note:"5月下旬以降に播種。霜に弱いので早まきしないこと。高冷地で香りが濃厚になる。",layer:"草本層"},
  {id:"v009",name:"エゴマ",en:"Perilla",category:"野菜・葉物",icon:"🌿",
   sowStart:toCode(5,2),sowEnd:toCode(6,1),harvestStart:toCode(7,1),harvestEnd:toCode(9,2),
   altitudeRating:4,coldHardy:false,note:"5月下旬〜6月中旬播種。ω-3脂肪酸豊富。初霜（10月上旬）前に収穫完了。",layer:"草本層"},
  {id:"v010",name:"ニラ",en:"Garlic chives",category:"野菜・葉物",icon:"🌿",
   sowStart:toCode(4,2),sowEnd:toCode(5,1),harvestStart:toCode(6,1),harvestEnd:toCode(9,2),
   altitudeRating:5,coldHardy:true,note:"4月下旬〜5月中旬に播種。多年草で一度植えると数年収穫可。耐寒性高い。",layer:"草本層"},
  {id:"v011",name:"ネギ",en:"Welsh onion",category:"野菜・葉物",icon:"🧅",
   sowStart:toCode(4,0),sowEnd:toCode(5,0),harvestStart:toCode(10,0),harvestEnd:toCode(3,2),
   altitudeRating:5,coldHardy:true,note:"4月上旬〜5月上旬播種。冷涼地で甘みが増す。越冬可能で春まで収穫できる。",layer:"草本層"},
  {id:"v012",name:"ブロッコリー",en:"Broccoli",category:"野菜・葉物",icon:"🥦",
   sowStart:toCode(2,1),sowEnd:toCode(3,2),harvestStart:toCode(5,2),harvestEnd:toCode(7,0),
   altitudeRating:4,coldHardy:true,note:"2月中旬〜ハウスで育苗。5月下旬に屋外定植。秋作は6月下旬播種・9月収穫。",layer:"草本層"},
  {id:"v013",name:"カブ",en:"Turnip",category:"野菜・葉物",icon:"⚪",
   sowStart:toCode(5,0),sowEnd:toCode(8,1),harvestStart:toCode(6,0),harvestEnd:toCode(10,1),
   altitudeRating:5,coldHardy:true,note:"5月上旬〜随時播種可。成長早く高冷地向き。秋カブは8月中旬播種・10月収穫。",layer:"草本層"},
  {id:"v014",name:"スイスチャード",en:"Swiss chard",category:"野菜・葉物",icon:"🌈",
   sowStart:toCode(5,1),sowEnd:toCode(7,0),harvestStart:toCode(6,1),harvestEnd:toCode(10,0),
   altitudeRating:4,coldHardy:true,note:"5月中旬以降播種。耐寒性があり初霜（10月上旬）ギリギリまで収穫可。",layer:"草本層"},
  {id:"v015",name:"白菜",en:"Chinese cabbage",category:"野菜・葉物",icon:"🥬",
   sowStart:toCode(7,1),sowEnd:toCode(8,0),harvestStart:toCode(10,0),harvestEnd:toCode(11,0),
   altitudeRating:5,coldHardy:true,note:"7月中旬〜8月上旬播種・育苗。8月下旬定植。10月初旬の初霜前に収穫。甘くて絶品。",layer:"草本層"},

  // 野菜・実物
  {id:"f001",name:"トマト",en:"Tomato",category:"野菜・実物",icon:"🍅",
   sowStart:toCode(2,1),sowEnd:toCode(3,0),harvestStart:toCode(7,1),harvestEnd:toCode(10,0),
   altitudeRating:5,coldHardy:false,note:"2月中旬〜ハウスで育苗開始（約100日）。5月下旬に屋外定植。夜温低く糖度抜群。10月上旬の初霜前に収穫完了。",layer:"草本層"},
  {id:"f002",name:"ナス",en:"Eggplant",category:"野菜・実物",icon:"🍆",
   sowStart:toCode(2,2),sowEnd:toCode(3,0),harvestStart:toCode(7,2),harvestEnd:toCode(9,2),
   altitudeRating:3,coldHardy:false,note:"2月下旬〜ハウス育苗。6月上旬に定植（5月下旬は寒さで根が傷む）。黒マルチ必須。収量はやや落ちる。",layer:"草本層"},
  {id:"f003",name:"キュウリ",en:"Cucumber",category:"野菜・実物",icon:"🥒",
   sowStart:toCode(5,0),sowEnd:toCode(5,2),harvestStart:toCode(7,0),harvestEnd:toCode(9,1),
   altitudeRating:4,coldHardy:false,note:"5月上旬〜ハウス播種・育苗。5月下旬以降に屋外定植。トンネルで生育促進。",layer:"草本層"},
  {id:"f004",name:"ズッキーニ",en:"Zucchini",category:"野菜・実物",icon:"🟢",
   sowStart:toCode(5,1),sowEnd:toCode(5,2),harvestStart:toCode(7,0),harvestEnd:toCode(9,2),
   altitudeRating:4,coldHardy:false,note:"5月中旬〜播種。5月下旬以降に定植。葉が大きく地面を覆うマルチ効果あり。",layer:"草本層"},
  {id:"f005",name:"カボチャ",en:"Pumpkin",category:"野菜・実物",icon:"🎃",
   sowStart:toCode(5,1),sowEnd:toCode(5,2),harvestStart:toCode(8,1),harvestEnd:toCode(10,0),
   altitudeRating:5,coldHardy:false,note:"5月中旬播種・5月下旬定植。昼夜の寒暖差で糖度が上がる。信州高冷地カボチャは絶品。",layer:"草本層"},
  {id:"f006",name:"ピーマン",en:"Bell pepper",category:"野菜・実物",icon:"🫑",
   sowStart:toCode(2,2),sowEnd:toCode(3,0),harvestStart:toCode(8,0),harvestEnd:toCode(9,2),
   altitudeRating:3,coldHardy:false,note:"2月下旬〜ハウス育苗（約100日）。6月上旬定植。高冷地では収量やや落ちるが、マルチ保温で安定。",layer:"草本層"},
  {id:"f007",name:"インゲン",en:"Green bean",category:"野菜・実物",icon:"🫘",
   sowStart:toCode(5,2),sowEnd:toCode(6,1),harvestStart:toCode(7,1),harvestEnd:toCode(9,0),
   altitudeRating:4,coldHardy:false,note:"霜が終わる5月下旬以降に播種。窒素固定で土壌を豊かにする。",layer:"草本層"},
  {id:"f008",name:"エダマメ",en:"Edamame",category:"野菜・実物",icon:"🟡",
   sowStart:toCode(5,2),sowEnd:toCode(6,1),harvestStart:toCode(8,1),harvestEnd:toCode(9,1),
   altitudeRating:4,coldHardy:false,note:"5月下旬以降播種。高冷地の昼夜差で甘みが強い。霜前の9月中旬には収穫を。",layer:"草本層"},

  // 根菜・球根
  {id:"r001",name:"ジャガイモ",en:"Potato",category:"根菜・球根",icon:"🥔",
   sowStart:toCode(5,0),sowEnd:toCode(5,1),harvestStart:toCode(8,0),harvestEnd:toCode(9,0),
   altitudeRating:5,coldHardy:false,note:"5月上旬〜中旬に植え付け（霜リスクあるがジャガイモは比較的耐える）。8月上旬から掘り起こし可能。",layer:"地下層"},
  {id:"r002",name:"サツマイモ",en:"Sweet potato",category:"根菜・球根",icon:"🍠",
   sowStart:toCode(5,2),sowEnd:toCode(6,0),harvestStart:toCode(10,0),harvestEnd:toCode(10,0),
   altitudeRating:3,coldHardy:false,note:"5月下旬〜6月上旬に苗を定植（霜が終わってから）。10月上旬の初霜前に必ず収穫。黒マルチ必須。",layer:"地下層"},
  {id:"r003",name:"ニンジン",en:"Carrot",category:"根菜・球根",icon:"🥕",
   sowStart:toCode(5,1),sowEnd:toCode(7,1),harvestStart:toCode(8,0),harvestEnd:toCode(10,0),
   altitudeRating:5,coldHardy:true,note:"5月中旬〜随時播種可。夏播き（7月中旬）すれば秋10月に高品質ニンジン収穫。高冷地で甘みが強い。",layer:"地下層"},
  {id:"r004",name:"タマネギ",en:"Onion",category:"根菜・球根",icon:"🧅",
   sowStart:toCode(9,0),sowEnd:toCode(9,2),harvestStart:toCode(6,1),harvestEnd:toCode(7,0),
   altitudeRating:4,coldHardy:true,note:"9月上旬〜下旬にハウスで播種・育苗。10〜11月に定植し越冬。3月中旬から不織布で保温すると安定。",layer:"地下層"},
  {id:"r005",name:"ニンニク",en:"Garlic",category:"根菜・球根",icon:"🧄",
   sowStart:toCode(9,1),sowEnd:toCode(10,0),harvestStart:toCode(6,1),harvestEnd:toCode(7,0),
   altitudeRating:4,coldHardy:true,note:"9月中旬〜10月上旬に球を植え付け越冬。高冷地で品質の高いニンニクが育つ。",layer:"地下層"},
  {id:"r006",name:"ゴボウ",en:"Burdock",category:"根菜・球根",icon:"🟫",
   sowStart:toCode(5,0),sowEnd:toCode(5,1),harvestStart:toCode(10,0),harvestEnd:toCode(11,0),
   altitudeRating:4,coldHardy:true,note:"5月上旬〜中旬に直播き。深い根が土壌を耕す。晩秋10月〜11月に収穫。",layer:"地下層"},
  {id:"r007",name:"ダイコン",en:"Daikon",category:"根菜・球根",icon:"🟤",
   sowStart:toCode(6,1),sowEnd:toCode(8,0),harvestStart:toCode(9,0),harvestEnd:toCode(10,2),
   altitudeRating:5,coldHardy:true,note:"6月中旬〜8月上旬に播種。高冷地秋ダイコンは甘くて美味。10月下旬の初雪前に収穫完了。",layer:"地下層"},
  {id:"r008",name:"ヤーコン",en:"Yacon",category:"根菜・球根",icon:"🟡",
   sowStart:toCode(5,1),sowEnd:toCode(5,2),harvestStart:toCode(10,0),harvestEnd:toCode(10,1),
   altitudeRating:4,coldHardy:false,note:"5月中旬〜下旬に定植。初霜直前の10月上旬〜中旬に収穫。フラクトオリゴ糖豊富。",layer:"草本層"},

  // 果樹・木本類
  {id:"t001",name:"リンゴ",en:"Apple",category:"果樹・木本類",icon:"🍎",
   sowStart:toCode(3,1),sowEnd:toCode(4,0),harvestStart:toCode(8,1),harvestEnd:toCode(11,0),
   altitudeRating:5,coldHardy:true,note:"3月中旬〜4月上旬に苗木定植。飯綱町の代表品種！標高1000mで最高品質が育つ。品種により8月〜11月と長く楽しめる。",layer:"高木層"},
  {id:"t002",name:"ナシ",en:"Japanese pear",category:"果樹・木本類",icon:"🍐",
   sowStart:toCode(3,1),sowEnd:toCode(4,0),harvestStart:toCode(8,1),harvestEnd:toCode(10,0),
   altitudeRating:4,coldHardy:true,note:"3月中旬〜4月上旬に定植。高冷地で糖度が増す。受粉用に2品種以上を。",layer:"高木層"},
  {id:"t003",name:"モモ",en:"Peach",category:"果樹・木本類",icon:"🍑",
   sowStart:toCode(3,1),sowEnd:toCode(4,0),harvestStart:toCode(7,2),harvestEnd:toCode(9,1),
   altitudeRating:4,coldHardy:false,note:"3月中旬〜4月上旬定植。飯綱の桃は有名。標高差を活かし7月下旬〜9月中旬まで収穫できる。",layer:"亜高木層"},
  {id:"t004",name:"ウメ",en:"Japanese plum",category:"果樹・木本類",icon:"🌸",
   sowStart:toCode(3,0),sowEnd:toCode(3,2),harvestStart:toCode(6,1),harvestEnd:toCode(7,0),
   altitudeRating:4,coldHardy:true,note:"3月上旬〜下旬に定植。開花は平地より2〜3週遅い（4月下旬〜）。梅干し・梅酒に最適。",layer:"亜高木層"},
  {id:"t005",name:"クリ",en:"Chestnut",category:"果樹・木本類",icon:"🌰",
   sowStart:toCode(3,1),sowEnd:toCode(4,0),harvestStart:toCode(9,0),harvestEnd:toCode(10,0),
   altitudeRating:5,coldHardy:true,note:"3月中旬〜4月上旬定植。高冷地に最適な在来種。森の骨格を作る重要樹木。",layer:"高木層"},
  {id:"t006",name:"ブルーベリー",en:"Blueberry",category:"果樹・木本類",icon:"🫐",
   sowStart:toCode(3,1),sowEnd:toCode(4,1),harvestStart:toCode(7,1),harvestEnd:toCode(8,2),
   altitudeRating:5,coldHardy:true,note:"3月中旬〜4月中旬に定植。耐寒性品種（ハイブッシュ系）を選択。酸性土を好む。高冷地に最適。",layer:"低木層"},
  {id:"t007",name:"ラズベリー",en:"Raspberry",category:"果樹・木本類",icon:"🔴",
   sowStart:toCode(3,1),sowEnd:toCode(4,1),harvestStart:toCode(7,1),harvestEnd:toCode(8,2),
   altitudeRating:5,coldHardy:true,note:"3月中旬〜4月中旬定植。耐寒性極めて高く高冷地に最適。積雪の下で安全に越冬。",layer:"低木層"},
  {id:"t008",name:"スグリ（カーラント）",en:"Currant",category:"果樹・木本類",icon:"🟣",
   sowStart:toCode(3,1),sowEnd:toCode(4,0),harvestStart:toCode(7,0),harvestEnd:toCode(7,2),
   altitudeRating:5,coldHardy:true,note:"寒冷地原産で高冷地に最も適した果樹の一つ。3月中旬〜4月上旬定植。",layer:"低木層"},
  {id:"t009",name:"ヤマブドウ",en:"Wild grape",category:"果樹・木本類",icon:"🍇",
   sowStart:toCode(3,1),sowEnd:toCode(4,0),harvestStart:toCode(9,0),harvestEnd:toCode(10,0),
   altitudeRating:5,coldHardy:true,note:"山地に自生する在来種で耐寒性最強。アントシアニン豊富。3月中旬〜4月上旬定植。",layer:"つる植物"},
  {id:"t010",name:"アケビ",en:"Akebia",category:"果樹・木本類",icon:"🟣",
   sowStart:toCode(3,1),sowEnd:toCode(4,0),harvestStart:toCode(9,1),harvestEnd:toCode(10,0),
   altitudeRating:5,coldHardy:true,note:"高冷地の山に自生する在来つる植物。果実・葉・皮すべて食用。耐寒性最強クラス。",layer:"つる植物"},
  {id:"t011",name:"クルミ（オニグルミ）",en:"Walnut",category:"果樹・木本類",icon:"🟤",
   sowStart:toCode(3,1),sowEnd:toCode(4,0),harvestStart:toCode(9,0),harvestEnd:toCode(10,0),
   altitudeRating:5,coldHardy:true,note:"長野原産のオニグルミが最適。大木になり森の骨格に。耐寒性が非常に高い。",layer:"高木層"},
  {id:"t012",name:"ハシバミ",en:"Hazel",category:"果樹・木本類",icon:"🌰",
   sowStart:toCode(3,1),sowEnd:toCode(4,0),harvestStart:toCode(9,0),harvestEnd:toCode(10,0),
   altitudeRating:5,coldHardy:true,note:"低木のナッツ。耐寒性が非常に高い。早春の花粉が益虫の初期餌に。",layer:"低木層"},
  {id:"t013",name:"イチゴ",en:"Strawberry",category:"果樹・木本類",icon:"🍓",
   sowStart:toCode(9,0),sowEnd:toCode(9,2),harvestStart:toCode(6,0),harvestEnd:toCode(7,0),
   altitudeRating:4,coldHardy:true,note:"9月上旬〜下旬に苗を定植し越冬。雪の下で安全に越冬。6月〜7月上旬に甘い実が収穫できる。",layer:"草本層"},

  // ハーブ・薬草
  {id:"h001",name:"ミント",en:"Mint",category:"ハーブ・薬草",icon:"🌱",
   sowStart:toCode(5,1),sowEnd:toCode(6,0),harvestStart:toCode(6,1),harvestEnd:toCode(9,2),
   altitudeRating:5,coldHardy:true,note:"5月中旬〜6月上旬定植。地下茎で越冬。高冷地で爽やかな香りが強くなる。",layer:"草本層"},
  {id:"h002",name:"ラベンダー",en:"Lavender",category:"ハーブ・薬草",icon:"💜",
   sowStart:toCode(4,1),sowEnd:toCode(5,0),harvestStart:toCode(6,1),harvestEnd:toCode(7,0),
   altitudeRating:4,coldHardy:true,note:"4月中旬〜5月上旬に定植。耐寒性品種（ラバンジン系）なら標高1000mで越冬可。",layer:"低木層"},
  {id:"h003",name:"カモミール",en:"Chamomile",category:"ハーブ・薬草",icon:"🌼",
   sowStart:toCode(5,1),sowEnd:toCode(5,2),harvestStart:toCode(6,1),harvestEnd:toCode(7,2),
   altitudeRating:4,coldHardy:false,note:"5月中旬〜下旬に播種。高冷地でも育つ一年草。初霜までに枯れる。",layer:"草本層"},
  {id:"h004",name:"ヤロウ（セイヨウノコギリソウ）",en:"Yarrow",category:"ハーブ・薬草",icon:"🌾",
   sowStart:toCode(4,2),sowEnd:toCode(5,1),harvestStart:toCode(6,1),harvestEnd:toCode(8,2),
   altitudeRating:5,coldHardy:true,note:"4月下旬〜5月中旬に播種または株分け。高冷地の山野に自生する耐寒多年草。益虫誘引効果大。",layer:"草本層"},
  {id:"h005",name:"ドクダミ",en:"Dokudami",category:"ハーブ・薬草",icon:"🍃",
   sowStart:toCode(4,1),sowEnd:toCode(5,0),harvestStart:toCode(5,0),harvestEnd:toCode(7,0),
   altitudeRating:5,coldHardy:true,note:"4月中旬〜5月上旬に株分け定植。日本在来の薬草。高冷地の半日陰でも旺盛に育つ。",layer:"草本層"},
  {id:"h006",name:"コンフリー",en:"Comfrey",category:"ハーブ・薬草",icon:"💜",
   sowStart:toCode(4,2),sowEnd:toCode(5,1),harvestStart:toCode(5,0),harvestEnd:toCode(10,0),
   altitudeRating:5,coldHardy:true,note:"4月下旬〜5月中旬に株分けまたは根挿し。高冷地に適した多年草。液肥の原料として最高。",layer:"草本層"},
  {id:"h007",name:"エキナセア",en:"Echinacea",category:"ハーブ・薬草",icon:"🌸",
   sowStart:toCode(4,1),sowEnd:toCode(5,0),harvestStart:toCode(7,1),harvestEnd:toCode(9,1),
   altitudeRating:5,coldHardy:true,note:"4月中旬〜5月上旬に播種または定植。耐寒性極めて高い薬草。高冷地に最適。",layer:"草本層"},
  {id:"h008",name:"カレンデュラ",en:"Calendula",category:"ハーブ・薬草",icon:"🌻",
   sowStart:toCode(5,1),sowEnd:toCode(5,2),harvestStart:toCode(6,1),harvestEnd:toCode(10,0),
   altitudeRating:5,coldHardy:true,note:"5月中旬〜下旬播種。10月上旬の初霜まで長く花が咲く。益虫誘引・薬効に優れる。",layer:"草本層"},
  {id:"h009",name:"ボリジ",en:"Borage",category:"ハーブ・薬草",icon:"⭐",
   sowStart:toCode(5,2),sowEnd:toCode(6,0),harvestStart:toCode(7,0),harvestEnd:toCode(9,2),
   altitudeRating:4,coldHardy:false,note:"5月下旬〜6月上旬播種。ミツバチを強力に誘引する青い星型の花。",layer:"草本層"},
  {id:"h010",name:"ワサビ",en:"Wasabi",category:"ハーブ・薬草",icon:"🟢",
   sowStart:toCode(3,1),sowEnd:toCode(4,0),harvestStart:toCode(10,0),harvestEnd:toCode(3,2),
   altitudeRating:5,coldHardy:true,note:"3月中旬〜4月上旬に株分け定植。清流・高冷地が最適環境。標高1000mの冷たい水辺は絶好。",layer:"草本層"},
  {id:"h011",name:"フキ",en:"Fuki",category:"ハーブ・薬草",icon:"🍃",
   sowStart:toCode(3,1),sowEnd:toCode(4,0),harvestStart:toCode(4,0),harvestEnd:toCode(6,0),
   altitudeRating:5,coldHardy:true,note:"3月中旬〜4月上旬に株分け。日本在来の多年草。高冷地に自生。茎・葉柄が食用。",layer:"草本層"},
  {id:"h012",name:"ミツバ",en:"Japanese trefoil",category:"ハーブ・薬草",icon:"🍃",
   sowStart:toCode(4,0),sowEnd:toCode(5,0),harvestStart:toCode(5,0),harvestEnd:toCode(9,1),
   altitudeRating:5,coldHardy:true,note:"4月上旬〜5月上旬播種。半日陰を好む。高冷地の林縁に自然に増える在来種。",layer:"草本層"},
  {id:"h013",name:"ネトル（西洋イラクサ）",en:"Nettle",category:"ハーブ・薬草",icon:"🌿",
   sowStart:toCode(4,0),sowEnd:toCode(5,0),harvestStart:toCode(4,1),harvestEnd:toCode(6,0),
   altitudeRating:5,coldHardy:true,note:"4月上旬〜5月上旬に株分けまたは播種。耐寒性非常に強い。液肥の原料として最高。",layer:"草本層"},

  // 穀物・豆類
  {id:"g001",name:"ソバ",en:"Buckwheat",category:"穀物・豆類",icon:"🌾",
   sowStart:toCode(6,1),sowEnd:toCode(7,0),harvestStart:toCode(9,1),harvestEnd:toCode(10,0),
   altitudeRating:5,coldHardy:false,note:"6月中旬〜7月上旬播種。信州蕎麦の産地！高冷地に最適。9月中旬〜10月上旬（霜前）に収穫。",layer:"草本層"},
  {id:"g002",name:"ダイズ",en:"Soybean",category:"穀物・豆類",icon:"🫘",
   sowStart:toCode(5,2),sowEnd:toCode(6,0),harvestStart:toCode(9,1),harvestEnd:toCode(10,0),
   altitudeRating:4,coldHardy:false,note:"5月下旬〜6月上旬播種（早生品種）。霜前の9月中旬〜10月上旬に収穫。窒素固定。",layer:"草本層"},
  {id:"g003",name:"トウモロコシ",en:"Corn",category:"穀物・豆類",icon:"🌽",
   sowStart:toCode(5,1),sowEnd:toCode(5,2),harvestStart:toCode(8,0),harvestEnd:toCode(9,0),
   altitudeRating:4,coldHardy:false,note:"5月中旬〜下旬播種。高冷地の昼夜差で糖度が抜群。早生品種を選ぶと安定。",layer:"草本層"},
  {id:"g004",name:"ライ麦",en:"Rye",category:"穀物・豆類",icon:"🌾",
   sowStart:toCode(9,0),sowEnd:toCode(10,0),harvestStart:toCode(6,0),harvestEnd:toCode(6,2),
   altitudeRating:5,coldHardy:true,note:"9月上旬〜10月上旬に播種して越冬。耐寒性最強の穀物。春に緑肥として鋤込みも可能。",layer:"草本層"},
  {id:"g005",name:"アマランサス",en:"Amaranth",category:"穀物・豆類",icon:"🌸",
   sowStart:toCode(5,2),sowEnd:toCode(6,0),harvestStart:toCode(9,1),harvestEnd:toCode(10,0),
   altitudeRating:4,coldHardy:false,note:"5月下旬〜6月上旬播種。高タンパク擬似穀物。初霜前の9月中旬〜10月上旬に収穫。",layer:"草本層"},
  {id:"g006",name:"ヒマワリ",en:"Sunflower",category:"穀物・豆類",icon:"🌻",
   sowStart:toCode(5,1),sowEnd:toCode(5,2),harvestStart:toCode(9,0),harvestEnd:toCode(10,0),
   altitudeRating:4,coldHardy:false,note:"5月中旬〜下旬播種。高冷地でも育つ。種が野鳥を呼ぶ。深い根が土壌を改善。",layer:"草本層"},

  // 高冷地特産
  {id:"sp001",name:"アスパラガス",en:"Asparagus",category:"高冷地特産",icon:"🌿",
   sowStart:toCode(4,1),sowEnd:toCode(5,0),harvestStart:toCode(5,0),harvestEnd:toCode(7,0),
   altitudeRating:5,coldHardy:true,note:"4月中旬〜5月上旬に株の定植。多年草で耐寒性が非常に強い。一度植えると10年以上収穫可能。",layer:"草本層"},
  {id:"sp002",name:"フキノトウ",en:"Fuki sprout",category:"高冷地特産",icon:"🌱",
   sowStart:toCode(3,0),sowEnd:toCode(3,1),harvestStart:toCode(3,0),harvestEnd:toCode(4,0),
   altitudeRating:5,coldHardy:true,note:"雪解け直後（3月上旬〜中旬）に現れる春の最初の恵み。株で管理。高冷地の森の象徴。",layer:"草本層"},
  {id:"sp003",name:"ウド",en:"Udo",category:"高冷地特産",icon:"🌿",
   sowStart:toCode(4,0),sowEnd:toCode(4,2),harvestStart:toCode(4,1),harvestEnd:toCode(5,2),
   altitudeRating:5,coldHardy:true,note:"4月上旬〜下旬に株分け。山菜の王様。高冷地の半日陰に自生。多年草で毎年収穫できる。",layer:"草本層"},
  {id:"sp004",name:"コゴミ（クサソテツ）",en:"Ostrich fern",category:"高冷地特産",icon:"🌿",
   sowStart:toCode(4,0),sowEnd:toCode(4,1),harvestStart:toCode(4,1),harvestEnd:toCode(5,0),
   altitudeRating:5,coldHardy:true,note:"4月上旬〜中旬に株分け定植。高冷地の湿った林縁に適した山菜シダ。毎年収穫できる多年草。",layer:"草本層"},
  {id:"sp005",name:"セロリ",en:"Celery",category:"高冷地特産",icon:"🥬",
   sowStart:toCode(3,1),sowEnd:toCode(4,0),harvestStart:toCode(8,0),harvestEnd:toCode(9,2),
   altitudeRating:5,coldHardy:false,note:"3月中旬〜4月上旬にハウスで育苗。5月下旬に定植。信州高冷地は全国有数のセロリ産地！",layer:"草本層"},
  {id:"sp006",name:"ワラビ",en:"Bracken",category:"高冷地特産",icon:"🌿",
   sowStart:toCode(4,0),sowEnd:toCode(4,1),harvestStart:toCode(4,2),harvestEnd:toCode(5,1),
   altitudeRating:5,coldHardy:true,note:"4月上旬〜中旬に株分けまたは自然定着。春の山菜の代表。群生させると景観も美しい。",layer:"草本層"},
];

const CATEGORIES = ["すべて","野菜・葉物","野菜・実物","根菜・球根","果樹・木本類","ハーブ・薬草","穀物・豆類","高冷地特産"];
const MONTHS = ["1","2","3","4","5","6","7","8","9","10","11","12"];

const CAT_COLORS = {
  "野菜・葉物":   {bg:"#d4edda",accent:"#1b5e20",dot:"#52b788"},
  "野菜・実物":   {bg:"#fde8d8",accent:"#9c4221",dot:"#e07b39"},
  "根菜・球根":   {bg:"#ede0cc",accent:"#5d3a1a",dot:"#a0522d"},
  "果樹・木本類": {bg:"#fff3cd",accent:"#856404",dot:"#f4a732"},
  "ハーブ・薬草": {bg:"#e8d5f5",accent:"#6a1b9a",dot:"#ab47bc"},
  "穀物・豆類":   {bg:"#dce8f5",accent:"#1a4971",dot:"#4a90d9"},
  "高冷地特産":   {bg:"#e0f7fa",accent:"#006064",dot:"#00acc1"},
};

// ── 旬バー表示コンポーネント ─────────────────────────────────────────────
function JunBar({ startCode, endCode, color, currentCode }) {
  // 全36旬を表示（1月上旬〜12月下旬）
  const allCodes = Array.from({length:36}, (_,i) => toCode(Math.floor(i/3)+1, i%3));
  return (
    <div style={{display:"flex",gap:1,flexWrap:"nowrap",alignItems:"center"}}>
      {allCodes.map((code, i) => {
        const active = inRange(code, startCode, endCode);
        const isCurrent = code === currentCode;
        const { j } = fromCode(code);
        // 月の区切りを視覚化（上旬の左に少し大きめの隙間）
        const marginLeft = j === 0 && i > 0 ? 3 : 0;
        return (
          <div key={code} style={{
            width: 7, height: 10, borderRadius: 1,
            background: isCurrent ? "#fff" : active ? color : "#e5e7eb",
            marginLeft,
            outline: isCurrent ? `2px solid ${color}` : "none",
            flexShrink: 0,
          }} />
        );
      })}
    </div>
  );
}

// ── 月ラベル付きバー ─────────────────────────────────────────────────────
function JunBarWithLabels({ startCode, endCode, color, currentCode }) {
  const allCodes = Array.from({length:36}, (_,i) => toCode(Math.floor(i/3)+1, i%3));
  return (
    <div>
      {/* 月ラベル */}
      <div style={{display:"flex",gap:1,marginBottom:1}}>
        {Array.from({length:12},(_,mi)=>(
          <div key={mi} style={{width:7*3+3*2,flexShrink:0,fontSize:8,color:"#bbb",textAlign:"center",marginLeft:mi>0?3:0}}>
            {mi+1}
          </div>
        ))}
      </div>
      {/* 旬バー */}
      <div style={{display:"flex",gap:1,alignItems:"center"}}>
        {allCodes.map((code, i) => {
          const active = inRange(code, startCode, endCode);
          const isCurrent = code === currentCode;
          const { j } = fromCode(code);
          return (
            <div key={code} title={codeToLabel(code)} style={{
              width:7, height:10, borderRadius:1,
              background: isCurrent ? "#fff" : active ? color : "#e5e7eb",
              marginLeft: j===0 && i>0 ? 3 : 0,
              outline: isCurrent ? `2px solid ${color}` : "none",
              flexShrink:0,
            }} />
          );
        })}
      </div>
      {/* 旬ラベル */}
      <div style={{display:"flex",gap:1,marginTop:1}}>
        {allCodes.map((code,i)=>{
          const {j} = fromCode(code);
          return <div key={code} style={{width:7,flexShrink:0,marginLeft:j===0&&i>0?3:0,fontSize:6,color:"#ddd",textAlign:"center"}}>{JSHORT[j]}</div>;
        })}
      </div>
    </div>
  );
}

function AltBadge({ rating }) {
  const color = rating >= 5 ? "#2d6a4f" : rating === 4 ? "#2d6a4f" : rating === 3 ? "#f59e0b" : "#e07b39";
  const label = rating >= 5 ? "★ 最適" : rating === 4 ? "◎ 良好" : rating === 3 ? "△ 工夫要" : "✗ 困難";
  return <span style={{fontSize:10,color,fontWeight:700,background:color+"15",borderRadius:10,padding:"1px 7px",border:`1px solid ${color}40`}}>{label}</span>;
}

// ── AI作物追加パネル ────────────────────────────────────────────────────
const AI_PROMPT_BASE = `あなたは協生農法・パーマカルチャーの専門家です。
長野県飯綱町上村（標高1000m、内陸冷涼、年平均約8℃、初霜10月上旬、終霜5月中旬、積雪期12〜3月）の気候に合わせた作物データをJSON配列で返してください。

時期は必ず「月+旬」の形式で返してください。
例: "5中"=5月中旬, "9下"=9月下旬, "10上"=10月上旬

JSON形式のみで返してください（コードブロック不要）：
[{"name":"日本語名","en":"英名","category":"カテゴリ（野菜・葉物/野菜・実物/根菜・球根/果樹・木本類/ハーブ・薬草/穀物・豆類/高冷地特産のいずれか）","icon":"絵文字1文字","sowStartStr":"播種開始(例:5中)","sowEndStr":"播種終了(例:6上)","harvestStartStr":"収穫開始(例:8下)","harvestEndStr":"収穫終了(例:10上)","altitudeRating":標高適性1-5,"coldHardy":耐寒性true/false,"note":"高冷地・旬単位の栽培メモ70字","layer":"草本層/低木層/亜高木層/高木層/地下層/つる植物のいずれか"}]`;

async function fetchCropData(userContent) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514", max_tokens: 1000,
      messages: [{ role: "user", content: AI_PROMPT_BASE + "\n\n" + userContent }]
    })
  });
  const data = await res.json();
  const text = data.content?.map(b => b.text || "").join("") || "";
  const parsed = JSON.parse(text.replace(/```json?|```/g, "").trim());
  return parsed.map((c, i) => ({
    ...c,
    id: "ai_" + Date.now() + "_" + i,
    sowStart:     parseJun(c.sowStartStr     || c.sowStart     || "5上"),
    sowEnd:       parseJun(c.sowEndStr       || c.sowEnd       || "6上"),
    harvestStart: parseJun(c.harvestStartStr || c.harvestStart || "8上"),
    harvestEnd:   parseJun(c.harvestEndStr   || c.harvestEnd   || "9上"),
  }));
}

function AIExpander({ onAdd, existingNames }) {
  const [open, setOpen]       = useState(false);
  const [mode, setMode]       = useState("single"); // "single" | "theme"
  const [singleInput, setSingleInput] = useState("");
  const [themeInput, setThemeInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus]   = useState("");
  const [preview, setPreview] = useState(null); // 追加プレビュー

  const isDup = (name) => existingNames.has(name);

  const addSingle = async () => {
    const name = singleInput.trim();
    if (!name) return;
    if (isDup(name)) { setStatus(`⚠️「${name}」はすでに登録済みです`); return; }
    setLoading(true); setStatus(""); setPreview(null);
    try {
      const crops = await fetchCropData(`以下の作物を1種類だけ返してください（必ず1要素の配列で）:\n「${name}」`);
      setPreview(crops);
      setStatus("");
    } catch(e) { setStatus("❌ 生成失敗。再試行してください。"); }
    setLoading(false);
  };

  const addTheme = async () => {
    const theme = themeInput.trim();
    if (!theme) return;
    setLoading(true); setStatus(""); setPreview(null);
    try {
      const crops = await fetchCropData(`以下のテーマに合う作物を5種類返してください:\n「${theme}」`);
      const newOnes = crops.filter(c => !isDup(c.name));
      if (newOnes.length === 0) { setStatus("⚠️ 該当する新しい作物が見つかりませんでした"); setLoading(false); return; }
      setPreview(newOnes);
      setStatus("");
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

  const cancelPreview = () => { setPreview(null); setStatus(""); };

  return (
    <div style={{background:"#fff",borderRadius:14,overflow:"hidden",border:"1.5px solid #c8e6c9",marginBottom:12}}>
      <button onClick={()=>{ setOpen(!open); setPreview(null); setStatus(""); }}
        style={{width:"100%",padding:"12px 16px",background:"linear-gradient(135deg,#1b4332,#2d6a4f)",color:"#fff",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:800,textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span>🌱 作物を追加する</span>
        <span>{open?"▲":"▼"}</span>
      </button>

      {open && (
        <div style={{padding:"14px 16px"}}>
          {/* モード切替 */}
          <div style={{display:"flex",gap:6,marginBottom:14}}>
            {[{id:"single",label:"🔍 作物名で1種追加"},{id:"theme",label:"📦 テーマで5種追加"}].map(m=>(
              <button key={m.id} onClick={()=>{setMode(m.id);setPreview(null);setStatus("");}}
                style={{flex:1,padding:"8px 4px",borderRadius:10,border:"2px solid",
                  borderColor:mode===m.id?"#2d6a4f":"#e0d8cc",
                  background:mode===m.id?"#f0fdf4":"#fafafa",
                  color:mode===m.id?"#1b4332":"#888",
                  fontWeight:mode===m.id?800:400,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                {m.label}
              </button>
            ))}
          </div>

          {/* 個別追加モード */}
          {mode==="single" && (
            <div>
              <div style={{fontSize:12,color:"#555",marginBottom:8,lineHeight:1.7}}>
                追加したい作物名を入力してください。AIが飯綱町上村の気候に合わせたデータを生成します。
              </div>
              <div style={{display:"flex",gap:8,marginBottom:6}}>
                <input value={singleInput} onChange={e=>setSingleInput(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&addSingle()}
                  placeholder="例：オカヒジキ、クコ、山椒..."
                  style={{flex:1,border:"1.5px solid #c8e6c9",borderRadius:8,padding:"9px 12px",fontSize:13,outline:"none",fontFamily:"inherit",background:"#fafff8"}} />
                <button onClick={addSingle} disabled={loading||!singleInput.trim()}
                  style={{padding:"9px 18px",borderRadius:8,border:"none",background:loading?"#aaa":"#1b4332",color:"#fff",fontWeight:700,cursor:loading?"wait":"pointer",fontSize:13,fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  {loading?"生成中...":"検索・追加"}
                </button>
              </div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {["山椒","クコ","オカヒジキ","タラの芽","コシアブラ","ハスカップ"].map(s=>(
                  <button key={s} onClick={()=>setSingleInput(s)}
                    style={{padding:"3px 10px",borderRadius:20,border:"1px solid #a8d5b5",background:"#f0fdf4",color:"#2d6a4f",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {/* テーマ追加モード */}
          {mode==="theme" && (
            <div>
              <div style={{fontSize:12,color:"#555",marginBottom:8,lineHeight:1.7}}>
                テーマやジャンルを入力すると、関連する作物を5種まとめて追加します。
              </div>
              <div style={{display:"flex",gap:8,marginBottom:6}}>
                <input value={themeInput} onChange={e=>setThemeInput(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&addTheme()}
                  placeholder="例：高冷地の山菜、薬用樹木..."
                  style={{flex:1,border:"1.5px solid #c8e6c9",borderRadius:8,padding:"9px 12px",fontSize:13,outline:"none",fontFamily:"inherit",background:"#fafff8"}} />
                <button onClick={addTheme} disabled={loading||!themeInput.trim()}
                  style={{padding:"9px 18px",borderRadius:8,border:"none",background:loading?"#aaa":"#1b4332",color:"#fff",fontWeight:700,cursor:loading?"wait":"pointer",fontSize:13,fontFamily:"inherit",whiteSpace:"nowrap"}}>
                  {loading?"生成中...":"追加"}
                </button>
              </div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {["高冷地の山菜","寒冷地向け果樹","在来薬草","雪国の伝統野菜","窒素固定植物","蜜源植物"].map(s=>(
                  <button key={s} onClick={()=>setThemeInput(s)}
                    style={{padding:"3px 10px",borderRadius:20,border:"1px solid #a8d5b5",background:"#f0fdf4",color:"#2d6a4f",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {/* ステータス */}
          {status && !preview && (
            <div style={{marginTop:10,fontSize:12,fontWeight:600,
              color:status.startsWith("✅")?"#2d6a4f":status.startsWith("⚠️")?"#92400e":"#c00"}}>
              {status}
            </div>
          )}

          {/* プレビュー */}
          {preview && (
            <div style={{marginTop:12,border:"1.5px solid #a8d5b5",borderRadius:12,overflow:"hidden"}}>
              <div style={{background:"#f0fdf4",padding:"8px 14px",fontSize:12,fontWeight:700,color:"#1b4332",borderBottom:"1px solid #c8e6c9"}}>
                📋 追加内容を確認してください（{preview.length}種）
              </div>
              {preview.map((c,i) => {
                const cat = CAT_COLORS[c.category] || CAT_COLORS["野菜・葉物"];
                return (
                  <div key={i} style={{padding:"10px 14px",borderBottom:i<preview.length-1?"1px solid #e8f5ee":"none",background:"#fff"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <span style={{fontSize:18}}>{c.icon}</span>
                      <div>
                        <span style={{fontWeight:800,fontSize:13,color:cat.accent}}>{c.name}</span>
                        <span style={{fontSize:11,color:"#aaa",marginLeft:6}}>{c.en}</span>
                      </div>
                      <span style={{marginLeft:"auto",fontSize:10,background:cat.bg,color:cat.accent,border:`1px solid ${cat.dot}50`,borderRadius:10,padding:"1px 7px"}}>{c.category}</span>
                    </div>
                    <div style={{fontSize:11,color:"#666",lineHeight:1.6,marginBottom:4}}>{c.note}</div>
                    <div style={{fontSize:10,color:"#aaa"}}>
                      🌱 {codeToLabel(c.sowStart)}〜{codeToLabel(c.sowEnd)} ／
                      🧺 {codeToLabel(c.harvestStart)}〜{codeToLabel(c.harvestEnd)}
                    </div>
                  </div>
                );
              })}
              <div style={{display:"flex",gap:8,padding:"10px 14px",background:"#f0fdf4"}}>
                <button onClick={confirmAdd}
                  style={{flex:2,padding:"9px",borderRadius:8,border:"none",background:"#1b4332",color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                  ✅ この内容で追加する
                </button>
                <button onClick={cancelPreview}
                  style={{flex:1,padding:"9px",borderRadius:8,border:"1px solid #ccc",background:"#fff",color:"#888",fontWeight:600,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {status && preview===null && status.startsWith("✅") && (
            <div style={{marginTop:10,fontSize:12,fontWeight:600,color:"#2d6a4f"}}>{status}</div>
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

  const [crops, setCrops] = useState(CROPS);
  const [view, setView] = useState("today");
  const [selectedCode, setSelectedCode] = useState(nowCode);
  const [selectedCat, setSelectedCat] = useState("すべて");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [filterAlt, setFilterAlt] = useState(false);
  const cropsCache = useRef(null);

  // 起動時：localStorageから追加作物を復元
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("kyosei_added_crops") || "[]");
      if (Array.isArray(saved) && saved.length > 0) {
        setCrops(prev => {
          const names = new Set(prev.map(c => c.name));
          return [...prev, ...saved.filter(c => !names.has(c.name))];
        });
      }
    } catch(e) {}
  }, []);

  const addCrops = (nc) => {
    setCrops(prev => {
      const names = new Set(prev.map(c => c.name));
      const newOnes = nc.filter(c => !names.has(c.name));
      if (newOnes.length === 0) return prev;
      return [...prev, ...newOnes];
    });
  };

  // crops変化のたびにlocalStorageへ自動保存
  useEffect(() => {
    const baseIds = new Set(CROPS.map(c => c.id));
    const extras = crops.filter(c => !baseIds.has(c.id));
    const json = JSON.stringify(extras);
    if (cropsCache.current === json) return;
    cropsCache.current = json;
    try { localStorage.setItem("kyosei_added_crops", json); } catch(e) {}
  }, [crops]);

  const climate = getClimate(selectedCode);
  const nowClimate = getClimate(nowCode);

  const todaySow     = crops.filter(c=>inRange(nowCode,c.sowStart,c.sowEnd));
  const todayHarvest = crops.filter(c=>inRange(nowCode,c.harvestStart,c.harvestEnd));

  const filtered = useMemo(()=>crops.filter(c=>{
    if (selectedCat!=="すべて"&&c.category!==selectedCat) return false;
    if (filterAlt&&(c.altitudeRating||3)<4) return false;
    if (search&&!c.name.includes(search)&&!c.en?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }),[crops,selectedCat,search,filterAlt]);

  const sorted = useMemo(()=>[...filtered].sort((a,b)=>{
    const aA=inRange(selectedCode,a.sowStart,a.sowEnd)||inRange(selectedCode,a.harvestStart,a.harvestEnd);
    const bA=inRange(selectedCode,b.sowStart,b.sowEnd)||inRange(selectedCode,b.harvestStart,b.harvestEnd);
    if(bA!==aA) return bA-aA;
    return (b.altitudeRating||3)-(a.altitudeRating||3);
  }),[filtered,selectedCode]);

  // 旬セレクター: 月×旬のグリッド
  const JunSelector = () => (
    <div style={{background:"#fff",borderRadius:12,padding:"10px 12px",marginBottom:10,border:"1px solid #e0d8cc",overflowX:"auto"}}>
      <div style={{fontSize:11,color:"#888",marginBottom:6,fontWeight:600}}>旬を選択</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(12, 1fr)",gap:3,minWidth:320}}>
        {Array.from({length:12},(_,mi)=>{
          const m=mi+1;
          const cl=CLIMATE_JUNS.find(c=>c.code===toCode(m,0));
          const hasFrost=cl&&(cl.frost===true||cl.frost==="risk");
          return (
            <div key={m}>
              <div style={{fontSize:9,color:"#aaa",textAlign:"center",marginBottom:2}}>{m}月</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:2}}>
                {[0,1,2].map(j=>{
                  const code=toCode(m,j);
                  const isSel=selectedCode===code;
                  const isNow=nowCode===code;
                  const cl2=CLIMATE_JUNS.find(c=>c.code===code);
                  const frost=cl2?.frost;
                  return (
                    <button key={j} onClick={()=>setSelectedCode(code)} title={codeToLabel(code)} style={{
                      padding:"3px 0",borderRadius:4,border:isNow?"2px solid #2d6a4f":"1px solid #ddd",
                      background:isSel?"#2d6a4f":frost===true?"#dbeafe":frost==="risk"?"#fef9c3":"#fff",
                      color:isSel?"#fff":frost===true?"#3b82f6":"#555",
                      fontSize:9,cursor:"pointer",fontWeight:isSel||isNow?800:400,fontFamily:"inherit",
                      lineHeight:1.2,
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
      <div style={{display:"flex",gap:10,marginTop:8,fontSize:10,color:"#aaa"}}>
        <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:10,height:10,background:"#dbeafe",borderRadius:2,display:"inline-block"}}/>霜あり</span>
        <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:10,height:10,background:"#fef9c3",borderRadius:2,display:"inline-block"}}/>霜リスク</span>
        <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:10,height:10,background:"#fff",border:"1px solid #ddd",borderRadius:2,display:"inline-block"}}/>霜なし</span>
        <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:10,height:10,background:"#fff",border:"2px solid #2d6a4f",borderRadius:2,display:"inline-block"}}/>今</span>
      </div>
    </div>
  );

  const ClimateCard = ({code}) => {
    const cl = getClimate(code);
    if(!cl) return null;
    const frostColor = cl.frost===true?"#3b82f6":cl.frost==="risk"?"#f59e0b":"#10b981";
    const frostLabel = cl.frost===true?"❄️ 霜あり":cl.frost==="risk"?"⚠️ 霜リスク":"✅ 霜なし";
    return (
      <div style={{background:"#fff",borderRadius:12,padding:"10px 14px",border:"1px solid #e0d8cc",marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <span style={{fontWeight:800,fontSize:14,color:"#1b4332"}}>{cl.label}</span>
          <span style={{background:frostColor+"15",color:frostColor,border:`1px solid ${frostColor}40`,borderRadius:10,padding:"2px 8px",fontWeight:700,fontSize:11}}>{frostLabel}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:8}}>
          <div style={{background:"#fef9f0",borderRadius:8,padding:"5px 8px",textAlign:"center"}}>
            <div style={{fontSize:9,color:"#999"}}>平均</div>
            <div style={{fontWeight:800,color:"#d97706",fontSize:14}}>{cl.avgTemp}℃</div>
          </div>
          <div style={{background:"#eff6ff",borderRadius:8,padding:"5px 8px",textAlign:"center"}}>
            <div style={{fontSize:9,color:"#999"}}>最低</div>
            <div style={{fontWeight:800,color:"#3b82f6",fontSize:14}}>{cl.minTemp}℃</div>
          </div>
          <div style={{background:cl.snow?"#f0f4ff":"#f9fafb",borderRadius:8,padding:"5px 8px",textAlign:"center"}}>
            <div style={{fontSize:9,color:"#999"}}>{cl.snow?"積雪":"積雪"}</div>
            <div style={{fontWeight:800,color:cl.snow?"#6366f1":"#aaa",fontSize:14}}>{cl.snow?"あり":"なし"}</div>
          </div>
        </div>
        <div style={{fontSize:12,color:"#555",lineHeight:1.7}}>🗓️ {cl.work}</div>
      </div>
    );
  };

  return (
    <div style={{minHeight:"100vh",background:"#f0ece3",fontFamily:"'Noto Serif JP','Georgia',serif",color:"#2c2c1e"}}>
      {/* Header */}
      <div style={{background:"linear-gradient(160deg,#1b4332 0%,#2d6a4f 55%,#40916c 100%)",padding:"20px 18px 14px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-30,right:-30,width:160,height:160,borderRadius:"50%",background:"rgba(255,255,255,0.05)"}}/>
        <div style={{position:"relative",zIndex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
            <span style={{fontSize:22}}>🏔️</span>
            <h1 style={{margin:0,fontSize:18,fontWeight:900,color:"#fff",letterSpacing:1}}>協生農法 作物の森</h1>
          </div>
          <p style={{margin:"2px 0 6px",fontSize:11,color:"rgba(255,255,255,0.8)"}}>📍 長野県飯綱町上村 標高1,000m ／ {crops.length}種 ／ 目標1,000種</p>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.9)",fontWeight:600}}>
            現在：{nowM}月{JNAME[nowJ]}
            <span style={{marginLeft:8,fontSize:11,fontWeight:400,color:"rgba(255,255,255,0.7)"}}>
              {nowClimate.frost===true?"❄️ 霜あり":nowClimate.frost==="risk"?"⚠️ 霜リスク":"✅ 霜なし"} / {nowClimate.avgTemp}℃
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{display:"flex",borderBottom:"2px solid #ddd",background:"#faf8f3"}}>
        {[{id:"today",label:"今の旬",icon:"📅"},{id:"calendar",label:"旬カレンダー",icon:"🗓"}].map(tab=>(
          <button key={tab.id} onClick={()=>setView(tab.id)} style={{flex:1,padding:"12px 4px",border:"none",background:"none",cursor:"pointer",fontSize:13,fontWeight:view===tab.id?800:500,color:view===tab.id?"#2d6a4f":"#888",borderBottom:view===tab.id?"3px solid #2d6a4f":"3px solid transparent",fontFamily:"inherit"}}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div style={{maxWidth:720,margin:"0 auto",padding:"12px 12px 40px"}}>
        <AIExpander onAdd={addCrops} existingNames={new Set(crops.map(c=>c.name))} />

        {/* TODAY */}
        {view==="today"&&(
          <div>
            <ClimateCard code={nowCode} />

            {nowClimate.frost===true&&(
              <div style={{background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:12,padding:"10px 14px",marginBottom:10,fontSize:12,color:"#1d4ed8"}}>
                ❄️ <strong>霜・積雪期間中</strong> — 屋外定植は不可。ハウス・室内での育苗・管理が必要です。
              </div>
            )}
            {nowClimate.frost==="risk"&&(
              <div style={{background:"#fffbeb",border:"1.5px solid #fbbf24",borderRadius:12,padding:"10px 14px",marginBottom:10,fontSize:12,color:"#92400e"}}>
                ⚠️ <strong>霜リスク期間</strong> — 耐寒性のない苗の屋外定植は控えてください。
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              <div style={{background:"#f0fdf4",borderRadius:12,padding:"12px",border:"1px solid #a8d5b5",textAlign:"center"}}>
                <div style={{fontSize:11,color:"#2d6a4f",fontWeight:700}}>🌱 播種・植樹</div>
                <div style={{fontSize:26,fontWeight:900,color:"#1b5e20"}}>{todaySow.length}<span style={{fontSize:12,fontWeight:400}}>種</span></div>
              </div>
              <div style={{background:"#fff7ed",borderRadius:12,padding:"12px",border:"1px solid #fbc89e",textAlign:"center"}}>
                <div style={{fontSize:11,color:"#9c4221",fontWeight:700}}>🧺 収穫</div>
                <div style={{fontSize:26,fontWeight:900,color:"#9c4221"}}>{todayHarvest.length}<span style={{fontSize:12,fontWeight:400}}>種</span></div>
              </div>
            </div>

            {[{type:"播種・植樹",list:todaySow,icon:"🌱",c:"#2d6a4f"},{type:"収穫",list:todayHarvest,icon:"🧺",c:"#9c4221"}].map(({type,list,icon,c})=>(
              <div key={type} style={{marginBottom:16}}>
                <h3 style={{margin:"0 0 8px",fontSize:13,fontWeight:800,color:c}}>{icon} {type}適期（{list.length}種）</h3>
                <div style={{display:"flex",flexDirection:"column",gap:7}}>
                  {list.map(crop=>{
                    const cat=CAT_COLORS[crop.category]||CAT_COLORS["野菜・葉物"];
                    const isEx=expandedId===crop.id;
                    return (
                      <div key={crop.id} onClick={()=>setExpandedId(isEx?null:crop.id)} style={{background:cat.bg,borderRadius:12,padding:"11px 14px",cursor:"pointer",border:`1px solid ${cat.dot}50`}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontSize:20}}>{crop.icon}</span>
                            <div>
                              <div style={{fontWeight:800,fontSize:14,color:cat.accent}}>{crop.name}</div>
                              <div style={{display:"flex",gap:4,marginTop:2}}>
                                <span style={{fontSize:10,color:"#aaa"}}>{crop.category}</span>
                                <AltBadge rating={crop.altitudeRating||3} />
                              </div>
                            </div>
                          </div>
                          <span style={{fontSize:11,color:"#aaa"}}>{isEx?"▲":"▼"}</span>
                        </div>
                        {/* 旬バー */}
                        <div style={{marginTop:4}}>
                          <div style={{fontSize:9,color:"#aaa",marginBottom:2}}>🌱 播種期</div>
                          <JunBar startCode={crop.sowStart} endCode={crop.sowEnd} color={cat.dot} currentCode={nowCode} />
                        </div>
                        {isEx&&(
                          <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${cat.dot}30`,fontSize:12,color:"#555",lineHeight:1.8}}>
                            <div style={{marginBottom:6}}>{crop.note}</div>
                            <div style={{fontSize:11,color:"#888"}}>🌱 播種: {codeToLabel(crop.sowStart)}〜{codeToLabel(crop.sowEnd)}</div>
                            <div style={{fontSize:11,color:"#888"}}>🧺 収穫: {codeToLabel(crop.harvestStart)}〜{codeToLabel(crop.harvestEnd)}</div>
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
        {view==="calendar"&&(
          <div>
            <JunSelector />
            <ClimateCard code={selectedCode} />

            {/* フィルター */}
            <div style={{background:"#fff",borderRadius:12,padding:"10px 12px",marginBottom:10,border:"1px solid #e0d8cc"}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 作物名で検索..." style={{width:"100%",border:"1px solid #ddd",borderRadius:8,padding:"6px 10px",fontSize:12,outline:"none",marginBottom:8,boxSizing:"border-box",fontFamily:"inherit"}} />
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
                {CATEGORIES.map(cat=>(
                  <button key={cat} onClick={()=>setSelectedCat(cat)} style={{padding:"3px 8px",borderRadius:20,border:"1.5px solid",borderColor:selectedCat===cat?"#2d6a4f":"#ccc",background:selectedCat===cat?"#2d6a4f":"#fff",color:selectedCat===cat?"#fff":"#666",fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:selectedCat===cat?700:400}}>{cat}</button>
                ))}
              </div>
              <label style={{display:"flex",alignItems:"center",gap:6,fontSize:11,cursor:"pointer",color:"#2d6a4f",fontWeight:600}}>
                <input type="checkbox" checked={filterAlt} onChange={e=>setFilterAlt(e.target.checked)} style={{accentColor:"#2d6a4f"}}/>
                標高適性「良好」以上のみ
              </label>
            </div>

            <div style={{fontSize:11,color:"#888",marginBottom:6}}>{sorted.length}種 ／ 旬の適期順</div>

            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {sorted.map(c=>{
                const cat=CAT_COLORS[c.category]||CAT_COLORS["野菜・葉物"];
                const isSow=inRange(selectedCode,c.sowStart,c.sowEnd);
                const isHarvest=inRange(selectedCode,c.harvestStart,c.harvestEnd);
                const active=isSow||isHarvest;
                const isEx=expandedId===c.id;
                return (
                  <div key={c.id} onClick={()=>setExpandedId(isEx?null:c.id)} style={{background:active?cat.bg:"#faf8f3",borderRadius:12,padding:"11px 13px",cursor:"pointer",border:active?`1.5px solid ${cat.dot}60`:"1.5px solid #e8e2d8",opacity:active?1:0.7,boxShadow:active?`0 2px 8px ${cat.dot}18`:"none",transition:"all 0.15s"}}>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:7}}>
                        <span style={{fontSize:20}}>{c.icon}</span>
                        <div>
                          <div style={{fontWeight:800,fontSize:13,color:active?cat.accent:"#555"}}>{c.name}</div>
                          <div style={{display:"flex",gap:4,marginTop:2,flexWrap:"wrap"}}>
                            <span style={{fontSize:10,color:"#aaa"}}>{c.category}</span>
                            <AltBadge rating={c.altitudeRating||3}/>
                            {c.coldHardy&&<span style={{fontSize:10,color:"#3b82f6",background:"#eff6ff",borderRadius:8,padding:"1px 5px",border:"1px solid #bfdbfe"}}>耐寒✓</span>}
                          </div>
                        </div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:3,alignItems:"flex-end"}}>
                        {isSow&&<span style={{fontSize:10,background:"#f0fdf4",color:"#4caf50",border:"1px solid #4caf50",borderRadius:10,padding:"1px 7px",fontWeight:700,whiteSpace:"nowrap"}}>🌱 播種期</span>}
                        {isHarvest&&<span style={{fontSize:10,background:"#fff7ed",color:"#e07b39",border:"1px solid #e07b39",borderRadius:10,padding:"1px 7px",fontWeight:700,whiteSpace:"nowrap"}}>🧺 収穫期</span>}
                      </div>
                    </div>

                    {/* 旬バー */}
                    <div style={{marginBottom:isEx?10:0}}>
                      <div style={{fontSize:9,color:"#aaa",marginBottom:2}}>🌱 播種・植樹</div>
                      <JunBarWithLabels startCode={c.sowStart} endCode={c.sowEnd} color={cat.dot} currentCode={selectedCode}/>
                      <div style={{fontSize:9,color:"#aaa",margin:"6px 0 2px"}}>🧺 収穫</div>
                      <JunBarWithLabels startCode={c.harvestStart} endCode={c.harvestEnd} color="#e07b39" currentCode={selectedCode}/>
                    </div>

                    {isEx&&(
                      <div style={{paddingTop:10,borderTop:`1px solid ${cat.dot}30`,fontSize:12,color:"#555",lineHeight:1.8}}>
                        🏔️ {c.note}
                        <div style={{marginTop:6,display:"flex",gap:12,flexWrap:"wrap",fontSize:11,color:"#888"}}>
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
