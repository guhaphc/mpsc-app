import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";

export default async function AdminDashboard(){
  const supabase=await createClient();
  const {data}=await supabase.auth.getClaims();
  if(!data?.claims)redirect("/login");

  const {data:profile}=await supabase.from("profiles").select("full_name,role").eq("id",data.claims.sub).single();
  if(!profile||profile.role!=="admin")redirect("/dashboard");

  const {data:users,error}=await supabase
    .from("profiles")
    .select("id,full_name,username,mobile,role,account_status,created_at")
    .in("role",["student","teacher"])
    .order("created_at",{ascending:false});

  if(error)return <div className="authWrap"><div className="card"><h2>Admin Dashboard</h2><div className="error">Unable to load users.</div></div></div>;

  const list=users??[];
  const students=list.filter(u=>u.role==="student");
  const teachers=list.filter(u=>u.role==="teacher");
  const pending=list.filter(u=>u.account_status==="pending").length;
  const active=list.filter(u=>u.account_status==="active").length;
  const disabled=list.filter(u=>u.account_status==="disabled").length;

  function UserRow({u}:{u:(typeof list)[number]}){
    return <tr key={u.id}>
      <td><strong>{u.full_name}</strong><small>{u.username} · {u.mobile}</small></td>
      <td><span className={"status "+u.account_status}>{u.account_status}</span></td>
      <td>{new Date(u.created_at).toLocaleDateString("en-IN")}</td>
      <td><div className="actions">
        {u.account_status==="pending"&&<>
          <form action="/api/admin/user-status" method="post"><input type="hidden" name="user_id" value={u.id}/><input type="hidden" name="status" value="active"/><button className="btn small primary">Approve</button></form>
          <form action="/api/admin/user-status" method="post"><input type="hidden" name="user_id" value={u.id}/><input type="hidden" name="status" value="rejected"/><button className="btn small danger">Reject</button></form>
        </>}
        {u.account_status==="active"&&<form action="/api/admin/user-status" method="post"><input type="hidden" name="user_id" value={u.id}/><input type="hidden" name="status" value="disabled"/><button className="btn small secondary">Disable</button></form>}
        {u.account_status==="disabled"&&<form action="/api/admin/user-status" method="post"><input type="hidden" name="user_id" value={u.id}/><input type="hidden" name="status" value="active"/><button className="btn small primary">Enable</button></form>}
        {u.account_status==="rejected"&&<form action="/api/admin/user-status" method="post"><input type="hidden" name="user_id" value={u.id}/><input type="hidden" name="status" value="pending"/><button className="btn small secondary">Reopen</button></form>}
      </div></td>
    </tr>;
  }

  function UserPanel({title,icon,items}:{title:string,icon:string,items:(typeof list)}){
    return <section className="panel adminUserPanel">
      <div className="panelHead"><div><h2>{icon} {title}</h2><p className="muted">{items.length} registered account{items.length===1?"":"s"}</p></div></div>
      {items.length===0?<div className="emptyState">No {title.toLowerCase()} registrations yet.</div>:
      <div className="tableWrap"><table><thead><tr><th>User</th><th>Status</th><th>Registered</th><th>Access</th></tr></thead><tbody>{items.map(u=><UserRow key={u.id} u={u}/>)}</tbody></table></div>}
    </section>;
  }

  return <div className="shell">
    <header className="topbar">
      <div className="topbarBrand"><img src="/mpsc-logo.png" className="brandLogo dashboardLogo" alt="MPSC ALL-IN-ONE"/><div className="brandSub">ADMIN CONTROL CENTER</div></div>
      <form action="/api/auth/signout" method="post"><button className="btn secondary">Logout</button></form>
    </header>
    <main className="main">
      <div className="pageHead"><div><h1>Admin Dashboard</h1><p className="muted">Simple control of users, access and premium membership.</p></div></div>

      <section className="dashboardHero adminHero">
        <div style={{fontSize:12,fontWeight:800,opacity:.8}}>PLATFORM CONTROL</div>
        <h1 style={{margin:"6px 0",fontSize:27}}>Welcome, {profile.full_name}</h1>
        <p className="muted">Academic content stays with Teachers. Admin controls access and membership.</p>
      </section>

      <div className="stats">
        <div className="stat"><strong>{students.length}</strong><span>Students</span></div>
        <div className="stat"><strong>{teachers.length}</strong><span>Teachers</span></div>
        <div className="stat"><strong>{pending}</strong><span>Pending Approval</span></div>
        <div className="stat"><strong>{active}</strong><span>Active Accounts</span></div>
      </div>

      <div className="adminControlGrid">
        <div className="quickCard"><div className="quickIcon">👨‍🎓</div><strong>Student Management</strong><div className="muted">Approve, reject, enable or disable student access.</div></div>
        <div className="quickCard"><div className="quickIcon">👨‍🏫</div><strong>Teacher Management</strong><div className="muted">Approve, reject, enable or disable teacher access.</div></div>
        <div className="quickCard"><div className="quickIcon">⭐</div><strong>Premium Management</strong><div className="muted">Premium activation and expiry will be connected to the membership table.</div><span className="badge" style={{marginTop:10}}>NEXT CONNECTION</span></div>
      </div>

      <div className="adminPanels">
        <UserPanel title="Student Management" icon="👨‍🎓" items={students}/>
        <UserPanel title="Teacher Management" icon="👨‍🏫" items={teachers}/>
      </div>

      <section className="panel adminSecurityNote">
        <div className="panelHead"><h2>🔐 Secure account actions</h2><p className="muted">Password reset and permanent deletion require privileged Supabase Admin API access; they will be added without exposing service credentials to the browser.</p></div>
        <div className="securityGrid">
          <div><strong>Reset Password</strong><span>Admin-only password reset workflow.</span></div>
          <div><strong>Permanent Delete</strong><span>Remove authentication and profile records together.</span></div>
          <div><strong>Enable / Disable</strong><span>Already connected to the current account-status workflow.</span></div>
        </div>
      </section>
    </main>
  </div>;
}
