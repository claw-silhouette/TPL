import { useState, useRef, useCallback, useEffect, useMemo } from "react";

// ═══════════════════════════════════════════════
// TPL — TONAL PULSE LANGUAGE v2.1
// Sender / Receiver / Translator / WAV Export
// ═══════════════════════════════════════════════

const FREQ_PRESETS = {
  bright: { label: "Bright", desc: "Clear chirpy — best for phones & small speakers", freqs: [400, 700, 1000, 1300, 1600], icon: "✦" },
  warm: { label: "Warm", desc: "Mid-range — balanced for most setups", freqs: [250, 450, 680, 950, 1200], icon: "◉" },
  deep: { label: "Deep", desc: "Low rumbling bass — needs decent speakers", freqs: [120, 220, 340, 480, 600], icon: "◈" },
  subsonic: { label: "Subsonic", desc: "Feel more than hear — needs subwoofer", freqs: [60, 110, 180, 260, 360], icon: "▼" },
  scifi: { label: "Sci-Fi", desc: "Wide dramatic range — cinematic machine voice", freqs: [150, 400, 800, 1400, 2000], icon: "◆" },
};

const SHORT_MS = 100;
const LONG_MS = 200;
const GAP_BEEP = 50;
const GAP_WORD = 200;

function buildSymbolMap(freqs) {
  return {
    a: { freq: freqs[0], dur: SHORT_MS }, A: { freq: freqs[0], dur: LONG_MS },
    e: { freq: freqs[1], dur: SHORT_MS }, E: { freq: freqs[1], dur: LONG_MS },
    i: { freq: freqs[2], dur: SHORT_MS }, I: { freq: freqs[2], dur: LONG_MS },
    o: { freq: freqs[3], dur: SHORT_MS }, O: { freq: freqs[3], dur: LONG_MS },
  };
}

function buildFreqBins(freqs) {
  const t = Math.max(30, Math.min(50, (freqs[1] - freqs[0]) * 0.35));
  return freqs.map((f, i) => ({ min: f - t, max: f + t, bin: ["L","M","H","T","LINK"][i] }));
}

const PREFIXES = {
  COMMAND: { written: "a", label: "Command" }, QUESTION: { written: "e", label: "Question" },
  URGENT: { written: "i", label: "Urgent" }, NEGATE: { written: "aa", label: "Negate" },
  CONDITION: { written: "ae", label: "Conditional" }, SCHEDULE: { written: "ai", label: "Schedule" },
  BROADCAST: { written: "ee", label: "Broadcast" }, EMERGENCY: { written: "ii", label: "Emergency" },
};

const VOCAB = {
  system:"aAe",motor:"aAi",sensor:"aAo",network:"aEa",power:"aEe",light:"aEi",camera:"aEo",door:"aIa",alarm:"aIe",
  display:"aIi",speaker:"aIo",fan:"aOa",pump:"aOe",valve:"aOi",robot:"aOo",drone:"Aae",vehicle:"Aai",temperature:"Aao",
  pressure:"Aea",humidity:"Aee",battery:"Aei",signal:"Aeo",data:"Aia",message:"Aie",file:"Aii",device:"Aio",unit:"Aoa",
  zone:"Aoe",group:"Aoi",all:"Aoo",start:"eAa",stop:"eAe",send:"eAi",report:"eAo",rotate:"eEa",move:"eEe",set:"eEi",
  wait:"eEo",open:"eIa",close:"eIe",increase:"eIi",decrease:"eIo",toggle:"eOa",scan:"eOe",connect:"eOi",disconnect:"eOo",
  save:"Eae",load:"Eai",reset:"Eao",update:"Eea",read:"Eei",write:"Eeo",enable:"Eia",disable:"Eie",lock:"Eii",unlock:"Eio",
  alert:"Eoa",confirm:"Eoe",deny:"Eoi",ping:"Eoo",left:"iAa",right:"iAe",up:"iAi",down:"iAo",forward:"iEa",backward:"iEe",
  north:"iEi",south:"iEo",east:"iIa",west:"iIe",center:"iIi",edge:"iIo",inside:"iOa",outside:"iOe",here:"iOi",there:"iOo",
  one:"Iae",two:"Iai",three:"Iao",four:"Iea",five:"Iee",six:"Ieo",seven:"Iia",eight:"Iie",nine:"Iio",ten:"Ioa",
  hundred:"Ioe",thousand:"Ioi",low:"oAa",medium:"oAe",high:"oAi",max:"oAo",min:"oEa",on:"oEe",off:"oEi",fast:"oEo",
  slow:"oIa",hot:"oIe",cold:"oIi",full:"oIo",empty:"oOa",yes:"oOe",no:"oOi",ok:"oOo",error:"Oae",ready:"Oai",busy:"Oao",
  degrees:"Oea",percent:"Oee",seconds:"Oeo",meters:"Oia",critical:"Oie",normal:"Oii",warning:"Oio",hello:"Ooa",
  goodbye:"Ooe",thanks:"Ooi",help:"Ooo",hey:"OAa",hi:"OAe",please:"OAi",sorry:"OAo",what:"OEa",where:"OEe",when:"OEi",
  who:"OEo",why:"OIa",how:"OIe",this:"OIi",that:"OIo",good:"OOa",bad:"OOe",done:"OOi",need:"OOo",want:"AAa",have:"AAe",
  go:"AAi",come:"AAo",give:"AEa",take:"AEe",know:"AEi",see:"AEo",now:"AIa",later:"AIe",again:"AIi",never:"AIo",am:"AOa",
  is:"AOe",are:"AOi",was:"AOo",not:"EAa",and:"EAe",or:"EAi",but:"EAo",if:"EEa",then:"EEe",so:"EEi",very:"EEo",my:"EIa",
  your:"EIe",it:"EIi",them:"EIo",me:"EOa",you:"EOe",we:"EOi",they:"EOo",
};
const REVERSE_VOCAB = {}; Object.entries(VOCAB).forEach(([e,t]) => { REVERSE_VOCAB[t] = e; });

function parseWrittenForm(w) {
  const v = new Set("aAeEiIoO".split(""));
  const t = [];
  for (const c of w.split("")) {
    if (c === " ") t.push({type:"wordgap"});
    else if (c === "~") t.push({type:"link"});
    else if (c === "/") { t.push({type:"prefix"}); t.push({type:"wordgap"}); }
    else if (v.has(c)) t.push({type:"symbol",char:c});
  }
  return t;
}

function renderTones(wf, ctx, dest, sm, linkF, onSym) {
  const tokens = parseWrittenForm(wf);
  let time = ctx.currentTime + 0.05;
  for (const tk of tokens) {
    if (tk.type === "symbol") {
      const s = sm[tk.char]; if (!s) continue;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = s.freq;
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(0.4, time + 0.01);
      g.gain.setValueAtTime(0.4, time + s.dur/1000 - 0.01);
      g.gain.linearRampToValueAtTime(0, time + s.dur/1000);
      o.connect(g); g.connect(dest); o.start(time); o.stop(time + s.dur/1000);
      if (onSym) { const cc=tk.char, ct=time; setTimeout(() => onSym(cc), (ct-ctx.currentTime)*1000); }
      time += s.dur/1000 + GAP_BEEP/1000;
    } else if (tk.type === "wordgap") { time += GAP_WORD/1000; }
    else if (tk.type === "link") {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = linkF;
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(0.35, time + 0.01);
      g.gain.setValueAtTime(0.35, time + SHORT_MS/1000 - 0.01);
      g.gain.linearRampToValueAtTime(0, time + SHORT_MS/1000);
      o.connect(g); g.connect(dest); o.start(time); o.stop(time + SHORT_MS/1000);
      time += SHORT_MS/1000 + GAP_WORD/1000;
    } else if (tk.type === "prefix") { time += GAP_BEEP/1000; }
  }
  return time - ctx.currentTime;
}

function calcDuration(wf, sm) {
  let ms = 50;
  for (const tk of parseWrittenForm(wf)) {
    if (tk.type === "symbol") { const s = sm[tk.char]; if (s) ms += s.dur + GAP_BEEP; }
    else if (tk.type === "wordgap") ms += GAP_WORD;
    else if (tk.type === "link") ms += SHORT_MS + GAP_WORD;
    else if (tk.type === "prefix") ms += GAP_BEEP;
  }
  return ms / 1000;
}

async function renderToWav(wf, sm, linkF) {
  const dur = calcDuration(wf, sm) + 0.3;
  const sr = 44100;
  const oc = new OfflineAudioContext(1, Math.ceil(sr * dur), sr);
  renderTones(wf, oc, oc.destination, sm, linkF, null);
  const buf = await oc.startRendering();
  const ch = buf.getChannelData(0);
  const dLen = ch.length * 2, hLen = 44, tLen = hLen + dLen;
  const ab = new ArrayBuffer(tLen), dv = new DataView(ab);
  const ws = (off, s) => { for (let i=0; i<s.length; i++) dv.setUint8(off+i, s.charCodeAt(i)); };
  ws(0,"RIFF"); dv.setUint32(4,tLen-8,true); ws(8,"WAVE"); ws(12,"fmt ");
  dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,1,true);
  dv.setUint32(24,sr,true); dv.setUint32(28,sr*2,true); dv.setUint16(32,2,true);
  dv.setUint16(34,16,true); ws(36,"data"); dv.setUint32(40,dLen,true);
  let off = 44;
  for (let i=0; i<ch.length; i++) {
    const s = Math.max(-1, Math.min(1, ch[i]));
    dv.setInt16(off, s<0 ? s*0x8000 : s*0x7FFF, true); off += 2;
  }
  return new Blob([ab], {type:"audio/wav"});
}

function englishToTPL(text, prefix = "COMMAND") {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g,"").split(/\s+/).filter(Boolean);
  const tw = [], unk = [];
  for (const w of words) { if (VOCAB[w]) tw.push(VOCAB[w]); else unk.push(w); }
  return { written: (PREFIXES[prefix]?.written||"a") + "/ " + tw.join(" "), unknown: unk, wordCount: tw.length };
}

function tplToEnglish(written) {
  const cleaned = written.replace(/^[aeiAEIO]+\/\s*/,"");
  const english = cleaned.split(/\s+/).filter(Boolean).map(w => w==="~" ? "→" : (REVERSE_VOCAB[w]||`[${w}]`));
  const pm = written.match(/^([aeiAEIO]+)\//);
  let pl = "";
  if (pm) { for (const [,v] of Object.entries(PREFIXES)) { if (v.written===pm[1]) { pl=`[${v.label}] `; break; } } }
  return pl + english.join(" ");
}

const EXAMPLES = [
  {english:"hey there"},{english:"hello"},{english:"motor start left fast"},{english:"sensor report temperature high"},
  {english:"please help me now"},{english:"what is temperature"},{english:"door open"},{english:"alarm stop"},
  {english:"robot move forward"},{english:"system reset"},{english:"good thanks"},{english:"we need help now"},
  {english:"fan set max"},{english:"you know what I want"},{english:"if hot then fan start"},
];

const VOCAB_CATS = {
  "Systems":["system","motor","sensor","network","power","light","camera","door","alarm","display","speaker","fan","pump","valve","robot","drone","vehicle"],
  "Properties":["temperature","pressure","humidity","battery","signal","data","message","file","device","unit","zone","group","all"],
  "Actions":["start","stop","send","report","rotate","move","set","wait","open","close","increase","decrease","toggle","scan","connect","disconnect","save","load","reset","update","read","write","enable","disable","lock","unlock","alert","confirm","deny","ping"],
  "Directions":["left","right","up","down","forward","backward","north","south","east","west","center","edge","inside","outside","here","there"],
  "Numbers":["one","two","three","four","five","six","seven","eight","nine","ten","hundred","thousand"],
  "Values":["low","medium","high","max","min","on","off","fast","slow","hot","cold","full","empty","yes","no","ok","error","ready","busy","degrees","percent","seconds","meters","critical","normal","warning"],
  "Social":["hello","hey","hi","goodbye","thanks","help","please","sorry","good","bad","done"],
  "Pronouns":["me","you","we","they","it","them","my","your","and","or","but","if","then","so","not","very"],
  "Questions":["what","where","when","who","why","how","this","that"],
  "Verbs":["want","need","have","go","come","give","take","know","see","am","is","are","was"],
  "Time":["now","later","again","never"],
};

const TC = {L:"#ff6b35",M:"#ffd166",H:"#06d6a0",T:"#118ab2",LINK:"#ef476f"};
const TL = {L:"LOW",M:"MID",H:"HIGH",T:"TOP",LINK:"LINK"};
const symColor = ch => {
  if("aA".includes(ch))return TC.L; if("eE".includes(ch))return TC.M;
  if("iI".includes(ch))return TC.H; if("oO".includes(ch))return TC.T;
  if(ch==="~")return TC.LINK; if(ch==="/")return"#ef476f"; return"#444";
};

export default function TPLApp() {
  const [tab,setTab]=useState("send");
  const [inputText,setInputText]=useState("");
  const [prefix,setPrefix]=useState("COMMAND");
  const [tplResult,setTplResult]=useState(null);
  const [isPlaying,setIsPlaying]=useState(false);
  const [activeSymbol,setActiveSymbol]=useState(null);
  const [isListening,setIsListening]=useState(false);
  const [detectedTones,setDetectedTones]=useState([]);
  const [decodedWritten,setDecodedWritten]=useState("");
  const [spectrumData,setSpectrumData]=useState([]);
  const [dictFilter,setDictFilter]=useState("");
  const [rawDecodeResult,setRawDecodeResult]=useState("");
  const [presetKey,setPresetKey]=useState("bright");
  const [isExporting,setIsExporting]=useState(false);
  const [rawTpl,setRawTpl]=useState("");

  const audioCtxRef=useRef(null);
  const analyserRef=useRef(null);
  const micRef=useRef(null);
  const animRef=useRef(null);
  const toneBufRef=useRef([]);
  const lastToneRef=useRef(null);
  const silRef=useRef(0);

  const cFreqs = FREQ_PRESETS[presetKey].freqs;
  const sm = useMemo(()=>buildSymbolMap(cFreqs),[presetKey]);
  const fb = useMemo(()=>buildFreqBins(cFreqs),[presetKey]);

  const handleTranslate = useCallback(()=>{
    if(!inputText.trim())return;
    setTplResult(englishToTPL(inputText,prefix));
  },[inputText,prefix]);

  const handlePlay = useCallback(async(wo)=>{
    const w = wo||tplResult?.written; if(!w)return;
    if(!audioCtxRef.current) audioCtxRef.current = new(window.AudioContext||window.webkitAudioContext)();
    if(audioCtxRef.current.state==="suspended") await audioCtxRef.current.resume();
    setIsPlaying(true); setActiveSymbol(null);
    const d = renderTones(w,audioCtxRef.current,audioCtxRef.current.destination,sm,cFreqs[4],s=>setActiveSymbol(s));
    setTimeout(()=>{setIsPlaying(false);setActiveSymbol(null);},d*1000+200);
  },[tplResult,sm,cFreqs]);

  const handleExport = useCallback(async(wo)=>{
    const w = wo||tplResult?.written; if(!w)return;
    setIsExporting(true);
    try {
      const blob = await renderToWav(w,sm,cFreqs[4]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href=url; a.download=`tpl_${w.replace(/[^a-zA-Z]/g,"_").slice(0,25)}.wav`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch(e){ console.error(e); }
    setIsExporting(false);
  },[tplResult,sm,cFreqs]);

  const startListening = useCallback(async()=>{
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      micRef.current = stream;
      const ctx = new(window.AudioContext||window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser(); an.fftSize=4096; an.smoothingTimeConstant=0.3;
      src.connect(an); analyserRef.current=an; audioCtxRef.current=ctx;
      setIsListening(true); setDetectedTones([]); setDecodedWritten("");
      toneBufRef.current=[]; lastToneRef.current=null; silRef.current=0;
      const bLen=an.frequencyBinCount, da=new Float32Array(bLen), sr=ctx.sampleRate;
      const detect = ()=>{
        an.getFloatFrequencyData(da);
        setSpectrumData(cFreqs.map(f=>({freq:f,power:Math.max(0,(da[Math.round(f/sr*an.fftSize)]||-100)+100)})));
        let mp=-Infinity,mf=0;
        for(let i=5;i<bLen;i++){if(da[i]>mp){mp=da[i];mf=i*sr/an.fftSize;}}
        if(mp>-40){
          let found=null;
          for(const b of fb){if(mf>=b.min&&mf<=b.max){found=b.bin;break;}}
          if(found){silRef.current=0;if(found!==lastToneRef.current){lastToneRef.current=found;toneBufRef.current.push({bin:found});
            setDetectedTones(p=>[...p.slice(-30),{bin:found,freq:Math.round(mf)}]);}}
        } else {
          silRef.current++;
          if(silRef.current>5)lastToneRef.current=null;
          if(silRef.current===15&&toneBufRef.current.length>0){
            const cm={L:"a",M:"e",H:"i",T:"o",LINK:"~"};
            setDecodedWritten(p=>(p?p+" ":"")+toneBufRef.current.map(t=>cm[t.bin]||"?").join(""));
            toneBufRef.current=[];
          }
        }
        animRef.current=requestAnimationFrame(detect);
      };
      detect();
    } catch(e){console.error(e);}
  },[cFreqs,fb]);

  const stopListening = useCallback(()=>{
    setIsListening(false);
    micRef.current?.getTracks().forEach(t=>t.stop()); micRef.current=null;
    if(animRef.current)cancelAnimationFrame(animRef.current);
  },[]);

  useEffect(()=>()=>{
    if(animRef.current)cancelAnimationFrame(animRef.current);
    micRef.current?.getTracks().forEach(t=>t.stop());
  },[]);

  const B={border:"none",borderRadius:6,fontWeight:700,fontFamily:"inherit",cursor:"pointer",fontSize:12,letterSpacing:"0.05em"};

  return (
    <div style={{minHeight:"100vh",background:"#0a0a0f",color:"#e0e0e0",fontFamily:"'JetBrains Mono','Fira Code','SF Mono',monospace"}}>
      {/* HEADER */}
      <div style={{padding:"20px 24px 14px",borderBottom:"1px solid #1a1a2e",background:"linear-gradient(180deg,#0f0f1a,#0a0a0f)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:"#06d6a0",boxShadow:"0 0 8px #06d6a0",animation:"pulse 2s infinite"}}/>
          <h1 style={{margin:0,fontSize:20,fontWeight:700,letterSpacing:"0.15em",color:"#fff"}}>TPL <span style={{color:"#06d6a0"}}>·</span> TONAL PULSE LANGUAGE</h1>
        </div>
        <p style={{margin:0,fontSize:11,color:"#555",letterSpacing:"0.08em"}}>v2.1 — VOICE: <span style={{color:"#06d6a0"}}>{FREQ_PRESETS[presetKey].label.toUpperCase()}</span> ({cFreqs[0]}–{cFreqs[4]} Hz)</p>
      </div>

      {/* TABS */}
      <div style={{display:"flex",borderBottom:"1px solid #1a1a2e",background:"#0d0d15",overflowX:"auto"}}>
        {[{id:"send",l:"⟩ SENDER"},{id:"receive",l:"⟨ RECEIVER"},{id:"dictionary",l:"◊ DICT"},{id:"about",l:"? ABOUT"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:"11px 18px",background:tab===t.id?"#1a1a2e":"transparent",
            color:tab===t.id?"#06d6a0":"#555",border:"none",
            borderBottom:tab===t.id?"2px solid #06d6a0":"2px solid transparent",
            cursor:"pointer",fontSize:11,fontFamily:"inherit",letterSpacing:"0.1em",
            fontWeight:tab===t.id?700:400,whiteSpace:"nowrap",
          }}>{t.l}</button>
        ))}
      </div>

      <div style={{padding:"20px 24px",maxWidth:900,margin:"0 auto"}}>

        {/* PRESET SELECTOR */}
        {(tab==="send"||tab==="about"||tab==="receive")&&(
          <div style={{marginBottom:18}}>
            <label style={{fontSize:10,color:"#555",letterSpacing:"0.12em",display:"block",marginBottom:6}}>VOICE DEPTH PRESET</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {Object.entries(FREQ_PRESETS).map(([k,p])=>(
                <button key={k} onClick={()=>setPresetKey(k)} style={{
                  padding:"7px 12px",background:presetKey===k?"#1a2a2e":"#111122",
                  border:presetKey===k?"1px solid #06d6a0":"1px solid #1a1a2e",
                  borderRadius:6,color:presetKey===k?"#06d6a0":"#777",fontSize:11,
                  fontFamily:"inherit",cursor:"pointer",transition:"all 0.15s",minWidth:90,textAlign:"left",
                }}><span style={{fontSize:13,marginRight:5}}>{p.icon}</span><strong>{p.label}</strong>
                  <div style={{fontSize:8,color:"#555",marginTop:1}}>{p.freqs[0]}–{p.freqs[4]} Hz</div>
                </button>
              ))}
            </div>
            <div style={{marginTop:8,display:"flex",gap:5}}>
              {cFreqs.map((f,i)=>{
                const cs=[TC.L,TC.M,TC.H,TC.T,TC.LINK], ls=["Low","Mid","High","Top","Link"];
                return(<div key={i} style={{flex:1,textAlign:"center"}}>
                  <div style={{height:5,borderRadius:3,background:`linear-gradient(90deg,${cs[i]}60,${cs[i]})`}}/>
                  <div style={{fontSize:8,color:cs[i],marginTop:2}}>{ls[i]}</div>
                  <div style={{fontSize:9,color:"#fff",fontWeight:600}}>{f}Hz</div>
                </div>);
              })}
            </div>
          </div>
        )}

        {/* ═══ SENDER ═══ */}
        {tab==="send"&&(<div>
          <div style={{marginBottom:18}}>
            <label style={{fontSize:10,color:"#06d6a0",letterSpacing:"0.1em",display:"block",marginBottom:5}}>TYPE ENGLISH</label>
            <div style={{display:"flex",gap:6}}>
              <input value={inputText} onChange={e=>setInputText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleTranslate()}
                placeholder="e.g. motor start left fast" style={{flex:1,padding:"10px 12px",background:"#111122",border:"1px solid #2a2a3e",borderRadius:6,color:"#fff",fontSize:13,fontFamily:"inherit",outline:"none"}}/>
              <button onClick={handleTranslate} style={{...B,padding:"10px 16px",background:"#06d6a0",color:"#000",fontSize:13}}>TRANSLATE</button>
            </div>
          </div>

          <div style={{marginBottom:18}}>
            <label style={{fontSize:10,color:"#555",letterSpacing:"0.1em",display:"block",marginBottom:5}}>PREFIX</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
              {Object.entries(PREFIXES).map(([k,v])=>(<button key={k} onClick={()=>setPrefix(k)} style={{
                padding:"4px 10px",background:prefix===k?"#1a2a3e":"#111122",
                border:prefix===k?"1px solid #118ab2":"1px solid #1a1a2e",borderRadius:4,
                color:prefix===k?"#06d6a0":"#666",fontSize:10,fontFamily:"inherit",cursor:"pointer",
              }}>{v.label}</button>))}
            </div>
          </div>

          <div style={{marginBottom:18}}>
            <label style={{fontSize:10,color:"#555",letterSpacing:"0.1em",display:"block",marginBottom:5}}>EXAMPLES</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
              {EXAMPLES.map((ex,i)=>(<button key={i} onClick={()=>{setInputText(ex.english);setTplResult(englishToTPL(ex.english,prefix));}}
                style={{padding:"3px 9px",background:"#111122",border:"1px solid #1a1a2e",borderRadius:4,color:"#888",fontSize:10,fontFamily:"inherit",cursor:"pointer"}}>{ex.english}</button>))}
            </div>
          </div>

          {tplResult&&(<div style={{background:"#111122",border:"1px solid #1a1a2e",borderRadius:8,padding:16,marginBottom:12}}>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:"#555",marginBottom:3,letterSpacing:"0.1em"}}>WRITTEN TPL</div>
              <div style={{fontSize:20,fontWeight:700,color:"#fff",letterSpacing:"0.14em",wordBreak:"break-all",lineHeight:1.6}}>
                {tplResult.written.split("").map((ch,i)=>(<span key={i} style={{color:symColor(ch),textShadow:activeSymbol===ch?`0 0 12px ${symColor(ch)}`:"none",transition:"text-shadow 0.1s"}}>{ch}</span>))}
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:"#555",marginBottom:3}}>READS BACK AS</div>
              <div style={{fontSize:12,color:"#aaa"}}>{tplToEnglish(tplResult.written)}</div>
            </div>
            {tplResult.unknown.length>0&&(<div style={{padding:"5px 9px",background:"#2a1a1a",borderRadius:4,marginBottom:12,fontSize:10,color:"#ff6b35"}}>Unknown: {tplResult.unknown.join(", ")}</div>)}

            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:"#555",marginBottom:5}}>TONES</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                {tplResult.written.split("").filter(c=>c!==" "&&c!=="/").map((ch,i)=>{
                  const s=sm[ch],col=symColor(ch);
                  return(<div key={i} style={{padding:"2px 5px",background:col+"15",border:`1px solid ${col}40`,borderRadius:3,fontSize:8,color:col,textAlign:"center",minWidth:34}}>
                    <div style={{fontWeight:700}}>{ch}</div>
                    <div style={{opacity:0.7}}>{ch==="~"?cFreqs[4]:s?.freq}Hz</div>
                    {s?.dur&&<div style={{opacity:0.5}}>{s.dur}ms</div>}
                  </div>);
                })}
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button onClick={()=>handlePlay()} disabled={isPlaying} style={{...B,flex:"2 1 140px",padding:"10px 18px",background:isPlaying?"#333":"#06d6a0",color:isPlaying?"#666":"#000",fontSize:13}}>
                {isPlaying?"◉ TRANSMITTING...":"▶ PLAY AUDIO"}</button>
              <button onClick={()=>handleExport()} disabled={isExporting} style={{...B,flex:"1 1 100px",padding:"10px 14px",background:isExporting?"#333":"#118ab2",color:"#fff"}}>
                {isExporting?"⏳...":"⬇ SAVE .WAV"}</button>
            </div>
          </div>)}

          {/* RAW TPL */}
          <div style={{background:"#0d0d18",border:"1px solid #1a1a2e",borderRadius:8,padding:12,marginTop:12}}>
            <div style={{fontSize:10,color:"#555",marginBottom:5}}>RAW TPL INPUT</div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              <input value={rawTpl} onChange={e=>setRawTpl(e.target.value)} placeholder="a/ OAa iOo"
                style={{flex:"1 1 140px",padding:"8px 10px",background:"#111122",border:"1px solid #2a2a3e",borderRadius:6,color:"#fff",fontSize:12,fontFamily:"inherit",outline:"none"}}/>
              <button onClick={()=>rawTpl&&handlePlay(rawTpl)} disabled={isPlaying} style={{...B,padding:"8px 12px",background:"#118ab2",color:"#fff"}}>▶</button>
              <button onClick={()=>rawTpl&&setRawDecodeResult(tplToEnglish(rawTpl))} style={{...B,padding:"8px 12px",background:"#2a2a3e",color:"#aaa"}}>DECODE</button>
              <button onClick={()=>rawTpl&&handleExport(rawTpl)} disabled={isExporting} style={{...B,padding:"8px 12px",background:"#1a3a2e",color:"#06d6a0"}}>⬇ WAV</button>
            </div>
            {rawDecodeResult&&(<div style={{marginTop:8,padding:"8px 12px",background:"#06d6a010",border:"1px solid #06d6a030",borderRadius:6}}>
              <div style={{fontSize:9,color:"#06d6a0",letterSpacing:"0.1em",marginBottom:2}}>DECODED</div>
              <div style={{fontSize:14,color:"#fff",fontWeight:600}}>{rawDecodeResult}</div>
            </div>)}
          </div>
        </div>)}

        {/* ═══ RECEIVER ═══ */}
        {tab==="receive"&&(<div>
          <button onClick={isListening?stopListening:startListening} style={{
            ...B,padding:"12px 24px",width:"100%",fontSize:13,marginBottom:16,
            background:isListening?"#ef476f":"#06d6a0",color:isListening?"#fff":"#000",
            boxShadow:isListening?"0 0 20px #ef476f40":"none",
          }}>{isListening?"◉ LISTENING — TAP TO STOP":"⟨ START RECEIVER"}</button>

          {isListening&&(<div style={{background:"#111122",border:"1px solid #1a1a2e",borderRadius:8,padding:12,marginBottom:14}}>
            <div style={{fontSize:10,color:"#555",marginBottom:8}}>SPECTRUM — LIVE</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:8,height:80}}>
              {spectrumData.map((d,i)=>{
                const ls=["LOW","MID","HIGH","TOP","LINK"],cs=[TC.L,TC.M,TC.H,TC.T,TC.LINK];
                const pct=Math.min(100,d.power*1.5);
                return(<div key={i} style={{flex:1,textAlign:"center"}}>
                  <div style={{height:pct,background:`linear-gradient(to top,${cs[i]}40,${cs[i]})`,borderRadius:"3px 3px 0 0",transition:"height 0.1s",minHeight:2,boxShadow:pct>50?`0 0 8px ${cs[i]}60`:"none"}}/>
                  <div style={{fontSize:8,color:cs[i],marginTop:2}}>{d.freq}Hz</div>
                  <div style={{fontSize:7,color:"#555"}}>{ls[i]}</div>
                </div>);
              })}
            </div>
          </div>)}

          {detectedTones.length>0&&(<div style={{background:"#111122",border:"1px solid #1a1a2e",borderRadius:8,padding:12,marginBottom:14}}>
            <div style={{fontSize:10,color:"#555",marginBottom:5}}>DETECTED</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
              {detectedTones.map((t,i)=>(<span key={i} style={{padding:"2px 6px",background:TC[t.bin]+"20",border:`1px solid ${TC[t.bin]}50`,borderRadius:3,fontSize:9,color:TC[t.bin]}}>{TL[t.bin]} {t.freq}Hz</span>))}
            </div>
          </div>)}

          {decodedWritten&&(<div style={{background:"#111122",border:"1px solid #1a1a2e",borderRadius:8,padding:14}}>
            <div style={{fontSize:10,color:"#555",marginBottom:4}}>DECODED TPL</div>
            <div style={{fontSize:16,color:"#fff",letterSpacing:"0.12em",marginBottom:8}}>{decodedWritten}</div>
            <div style={{fontSize:10,color:"#555",marginBottom:3}}>ENGLISH</div>
            <div style={{fontSize:13,color:"#06d6a0"}}>{tplToEnglish(decodedWritten)}</div>
          </div>)}

          {!isListening&&!decodedWritten&&(<div style={{textAlign:"center",padding:32,color:"#333"}}>
            <div style={{fontSize:40,marginBottom:8}}>⟨</div><div style={{fontSize:11}}>Receiver idle</div>
          </div>)}
        </div>)}

        {/* ═══ DICTIONARY ═══ */}
        {tab==="dictionary"&&(<div>
          <input value={dictFilter} onChange={e=>setDictFilter(e.target.value)} placeholder="Search..."
            style={{width:"100%",padding:"8px 10px",marginBottom:14,background:"#111122",border:"1px solid #2a2a3e",borderRadius:6,color:"#fff",fontSize:12,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
          {Object.entries(VOCAB_CATS).map(([cat,ws])=>{
            const f=ws.filter(w=>!dictFilter||w.includes(dictFilter.toLowerCase()));
            if(!f.length)return null;
            return(<div key={cat} style={{marginBottom:18}}>
              <div style={{fontSize:10,color:"#06d6a0",letterSpacing:"0.15em",marginBottom:6,paddingBottom:4,borderBottom:"1px solid #1a1a2e"}}>{cat.toUpperCase()}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:4}}>
                {f.map(w=>(<button key={w} onClick={()=>{setTab("send");setInputText(w);setTplResult(englishToTPL(w,prefix));}}
                  style={{display:"flex",justifyContent:"space-between",padding:"5px 8px",background:"#111122",border:"1px solid #1a1a2e",borderRadius:4,color:"#ccc",fontSize:10,fontFamily:"inherit",cursor:"pointer",textAlign:"left"}}>
                  <span>{w}</span><span style={{color:"#555",fontSize:9}}>{VOCAB[w]}</span>
                </button>))}
              </div>
            </div>);
          })}
        </div>)}

        {/* ═══ ABOUT ═══ */}
        {tab==="about"&&(<div style={{lineHeight:1.8,color:"#999",fontSize:12}}>
          <div style={{background:"#111122",borderRadius:8,padding:16,border:"1px solid #1a1a2e",marginBottom:14}}>
            <h3 style={{color:"#06d6a0",fontSize:12,marginTop:0}}>ALPHABET — {FREQ_PRESETS[presetKey].label}</h3>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginTop:8}}>
              {[{w:"a",l:"Low ·",d:SHORT_MS,c:TC.L,f:cFreqs[0]},{w:"A",l:"Low ··",d:LONG_MS,c:TC.L,f:cFreqs[0]},
                {w:"e",l:"Mid ·",d:SHORT_MS,c:TC.M,f:cFreqs[1]},{w:"E",l:"Mid ··",d:LONG_MS,c:TC.M,f:cFreqs[1]},
                {w:"i",l:"High ·",d:SHORT_MS,c:TC.H,f:cFreqs[2]},{w:"I",l:"High ··",d:LONG_MS,c:TC.H,f:cFreqs[2]},
                {w:"o",l:"Top ·",d:SHORT_MS,c:TC.T,f:cFreqs[3]},{w:"O",l:"Top ··",d:LONG_MS,c:TC.T,f:cFreqs[3]},
              ].map((s,i)=>(<div key={i} style={{padding:6,background:s.c+"10",border:`1px solid ${s.c}30`,borderRadius:5,textAlign:"center"}}>
                <div style={{fontSize:20,fontWeight:700,color:s.c}}>{s.w}</div>
                <div style={{fontSize:8,color:"#888"}}>{s.l} {s.f}Hz {s.d}ms</div>
              </div>))}
            </div>
          </div>

          <div style={{background:"#111122",borderRadius:8,padding:16,border:"1px solid #1a1a2e",marginBottom:14}}>
            <h3 style={{color:"#06d6a0",fontSize:12,marginTop:0}}>SENTENCE STRUCTURE</h3>
            <div style={{fontSize:12,color:"#fff",background:"#0a0a15",padding:12,borderRadius:6,marginTop:4,overflowX:"auto"}}>
              <span style={{color:"#ef476f"}}>[PREFIX]</span><span style={{color:"#555"}}>/</span>{" "}
              <span style={{color:TC.L}}>[CATEGORY]</span>{" "}<span style={{color:TC.M}}>[ACTION]</span>{" "}
              <span style={{color:TC.H}}>[TARGET]</span>{" "}<span style={{color:TC.T}}>[VALUE]</span>{" "}
              <span style={{color:TC.LINK}}>~</span>{" "}<span style={{color:"#555"}}>[next...]</span>
            </div>
          </div>

          <div style={{background:"#111122",borderRadius:8,padding:16,border:"1px solid #1a1a2e",marginBottom:14}}>
            <h3 style={{color:"#06d6a0",fontSize:12,marginTop:0}}>EXPORT</h3>
            <div style={{fontSize:11,color:"#888",lineHeight:2}}>
              <div>Hit <strong style={{color:"#118ab2"}}>⬇ SAVE .WAV</strong> on any translated message</div>
              <div>Downloads a standard 44.1kHz 16-bit WAV file</div>
              <div>Play from any device — another receiver will decode it</div>
              <div>Works with all presets — just match sender & receiver</div>
            </div>
          </div>

          <div style={{background:"#111122",borderRadius:8,padding:16,border:"1px solid #1a1a2e"}}>
            <h3 style={{color:"#06d6a0",fontSize:12,marginTop:0}}>CAPACITY</h3>
            <div style={{fontSize:11,color:"#888",lineHeight:2}}>
              <div>Alphabet: <span style={{color:"#fff"}}>8 symbols</span> · 4 tones × 2 durations</div>
              <div>Words/slot: <span style={{color:"#fff"}}>4,096</span></div>
              <div>Statements: <span style={{color:"#fff"}}>281+ trillion</span></div>
              <div>Prefixes: <span style={{color:"#fff"}}>×8 modes</span></div>
              <div>Chaining: <span style={{color:"#fff"}}>Unlimited</span></div>
              <div>Vocabulary: <span style={{color:"#fff"}}>{Object.keys(VOCAB).length} words</span></div>
            </div>
          </div>
        </div>)}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} ::selection{background:#06d6a040} input::placeholder{color:#333}`}</style>
    </div>
  );
}
