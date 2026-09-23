"use client";

import {useState} from "react";

export default function AIStudyNotes(){
 const [subject,setSubject]=useState("");
 const [stage,setStage]=useState("Mains");
 const [generated,setGenerated]=useState(false);
 const [topic,setTopic]=useState("");
 return <div className="shell">
  <header className="topbar"><div className="topbarBrand"><img src="/mpsc-logo.png" className="brandLogo dashboardLogo" alt="MPSC ALL-IN-ONE"/><div className="brandSub">AI STUDY NOTES</div></div><a className="btn secondary" href="/teacher">Back</a></header>
  <main className="main">
   <section className="dashboardHero"><div style={{fontSize:12,fontWeight:700,opacity:.8}}>AI-POWERED SUBJECT BUILDER</div><h1 style={{margin:"6px 0",fontSize:27}}>Create Complete Subject Notes</h1><p className="muted">Use one master PDF to build the subject. Later, improve any topic with additional PDFs or images.</p></section>
   <section className="card">
    <h2>1. Select Subject</h2>
    <div className="formGrid">
     <label>Examination<select defaultValue="MPSC State Services"><option>MPSC State Services</option></select></label>
     <label>Stage<select value={stage} onChange={e=>setStage(e.target.value)}><option>Prelims</option><option>Mains</option></select></label>
     <label>Paper<select defaultValue="GS Paper II"><option>GS Paper I</option><option>GS Paper II</option><option>GS Paper III</option><option>GS Paper IV</option></select></label>
     <label>Subject<input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="e.g. Indian Polity"/></label>
    </div>
   </section>
   <section className="card">
    <h2>2. Upload Master PDF</h2>
    <p className="muted">This PDF will be used to create the complete subject according to the master syllabus.</p>
    <input type="file" accept=".pdf,application/pdf"/>
   </section>
   <section className="card">
    <h2>3. Generate</h2>
    <p className="muted">AI will organize the syllabus, topics and subtopics and create comprehensive exam-oriented notes.</p>
    <button className="btn primary" onClick={()=>setGenerated(true)} disabled={!subject}>✨ GENERATE COMPLETE SUBJECT</button>
    {!subject&&<p className="muted" style={{marginTop:8}}>Enter a subject first.</p>}
   </section>
   {generated&&<section className="card">
    <h2>✓ Subject Generated</h2>
    <p className="muted">{subject} · {stage}</p>
    <div className="topicList">{["Historical Background","Making of the Constitution","Preamble","Fundamental Rights","Directive Principles","Fundamental Duties","Parliament","Judiciary","Federalism","Constitutional Bodies"].map(t=><div className="topicRow" key={t}><span>{t}</span><span><button className="btn outline" onClick={()=>setTopic(t)}>View / Edit</button></span></div>)}</div>
   </section>}
   {topic&&<section className="card">
    <h2>{topic}</h2>
    <p className="muted">Review the generated notes for this topic.</p>
    <div className="sourceBox"><strong>➕ Add to Existing Notes</strong><p className="muted">Upload additional PDF or images. AI will integrate the useful information into this topic instead of creating a separate note.</p><input type="file" accept=".pdf,image/*" multiple/><button className="btn outline" style={{marginTop:10}}>✨ ADD TO EXISTING NOTES</button></div>
    <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}><button className="btn outline">✏️ Edit Notes</button><button className="btn outline">🔄 Regenerate</button><button className="btn primary">💾 Save Topic</button></div>
   </section>}
  </main>
  <nav className="bottomNav"><a href="/teacher">⌂<span>Home</span></a><a href="/teacher/ai-study-notes">▣<span>AI Notes</span></a><a href="/teacher">◉<span>Tests</span></a><a href="/teacher">•••<span>More</span></a></nav>
 </div>;
}
