export type TemplateCategory =
  | 'all' | 'welcome' | 'newsletter' | 'promotional' | 'product'
  | 'ecommerce' | 'reengagement' | 'event' | 'seasonal' | 'saas' | 'b2b'

export interface BuiltInTemplate {
  id: string
  name: string
  description: string
  category: Exclude<TemplateCategory, 'all'>
  accentColor: string
  html: string
}

export const CATEGORIES: { value: TemplateCategory; label: string }[] = [
  { value: 'all',          label: 'All Templates' },
  { value: 'welcome',      label: 'Welcome' },
  { value: 'newsletter',   label: 'Newsletter' },
  { value: 'promotional',  label: 'Promotional' },
  { value: 'product',      label: 'Product' },
  { value: 'ecommerce',    label: 'E-commerce' },
  { value: 'reengagement', label: 'Re-engagement' },
  { value: 'event',        label: 'Events' },
  { value: 'seasonal',     label: 'Seasonal' },
  { value: 'saas',         label: 'SaaS' },
  { value: 'b2b',          label: 'B2B' },
]

// ─── Shared mobile CSS ────────────────────────────────────────────────────────
const M = `<style type="text/css">
@media only screen and (max-width:620px){
/* Layout */
.eo{padding:10px!important}
.ec{border-radius:0!important;width:100%!important}
/* Sections */
.eh{padding:24px 16px!important}
.eb{padding:18px 16px!important}
.ef{padding:14px 16px!important}
.ep{padding:10px 16px!important}
/* Typography */
.h1{font-size:20px!important;line-height:1.25!important}
.h2{font-size:17px!important}
.h3{font-size:14px!important}
/* Buttons — full width on mobile */
.btn{display:block!important;width:100%!important;text-align:center!important;box-sizing:border-box!important;padding:14px 10px!important;font-size:15px!important}
/* Two-column stacking: tr becomes block so td children stack vertically */
.tcr{display:block!important;width:100%!important}
.col{display:block!important;width:100%!important;padding:6px 0!important;box-sizing:border-box!important}
/* Event detail cells stack vertically */
.evd{display:block!important;width:100%!important;border-right:none!important;border-bottom:1px solid #e5e7eb!important;box-sizing:border-box!important}
/* Transaction table: allow value to wrap */
.tdv{text-align:left!important;display:block!important;padding-top:0!important;font-size:13px!important}
.tdl{display:block!important;padding-bottom:2px!important;font-size:12px!important}
/* Promo code — shrink on very small screens */
.pc{font-size:18px!important;letter-spacing:2px!important}
/* Discount badge */
.disc-badge{font-size:28px!important;padding:6px 14px!important}
/* Images */
img{max-width:100%!important;height:auto!important}
/* Force table cells to not shrink weirdly */
td{word-break:break-word}
}
</style>`

function HEAD(t: string) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>${t}</title>${M}</head>`
}

const FTR = `<p style="color:#9ca3af;font-family:Arial,sans-serif;font-size:12px;margin:0;line-height:1.6;">You received this because you signed up. &nbsp;<a href="#" style="color:#9ca3af;">Unsubscribe</a> &nbsp;|&nbsp; <a href="#" style="color:#9ca3af;">View in browser</a></p>`

// ─── Factory: Banner ──────────────────────────────────────────────────────────
interface B { title:string; sub?:string; body:string; cta:string; ac:string; bg?:string; badge?:string; code?:string; disc?:string; op?:string; sp?:string; pre?:string }
function banner(o:B):string{
  const bg=o.bg||'#f4f4f4'
  return `${HEAD(o.title)}<body style="margin:0;padding:0;background:${bg};">${o.pre?`<div style="display:none;max-height:0;overflow:hidden;">${o.pre}</div>`:''}<center><table class="eo" role="presentation" width="100%" style="padding:28px 12px;"><tr><td><table class="ec" role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);"><tr><td class="eh" style="background:${o.ac};padding:44px 36px;text-align:center;">${o.badge?`<div style="display:inline-block;background:rgba(255,255,255,0.2);color:#fff;border:2px solid rgba(255,255,255,0.45);padding:5px 14px;border-radius:100px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;white-space:nowrap;">${o.badge}</div><br>`:''}<h1 class="h1" style="color:#fff;margin:0;font-family:Arial,sans-serif;font-size:28px;font-weight:800;line-height:1.2;word-break:break-word;">${o.title}</h1>${o.sub?`<p style="color:rgba(255,255,255,0.88);margin:10px 0 0;font-family:Arial,sans-serif;font-size:15px;line-height:1.5;">${o.sub}</p>`:''}</td></tr><tr><td class="eb" style="padding:36px;">${o.disc&&o.op&&o.sp?`<div style="text-align:center;margin-bottom:20px;"><span style="color:#9ca3af;font-family:Arial,sans-serif;font-size:15px;text-decoration:line-through;display:block;margin-bottom:4px;">Was ${o.op}</span><span style="color:${o.ac};font-family:Arial,sans-serif;font-size:28px;font-weight:800;">Now ${o.sp}</span></div>`:''}${o.disc&&!(o.op&&o.sp)?`<div style="text-align:center;margin-bottom:20px;"><span class="disc-badge" style="color:#fff;background:${o.ac};font-family:Arial,sans-serif;font-size:36px;font-weight:900;padding:8px 20px;border-radius:8px;display:inline-block;">${o.disc}</span></div>`:''}<p style="color:#374151;font-family:Arial,sans-serif;font-size:16px;line-height:1.75;margin:0 0 24px;">${o.body}</p>${o.code?`<div style="background:#f9fafb;border:2px dashed #d1d5db;border-radius:8px;padding:14px 12px;margin-bottom:22px;text-align:center;"><p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Use Code</p><p class="pc" style="margin:0;font-family:monospace;font-size:20px;font-weight:700;color:${o.ac};letter-spacing:4px;word-break:break-all;">${o.code}</p></div>`:''}<table role="presentation" width="100%"><tr><td style="text-align:center;padding:4px 0;"><a href="#" class="btn" style="display:inline-block;background:${o.ac};color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;font-size:16px;">${o.cta}</a></td></tr></table></td></tr><tr><td class="ef" style="padding:20px 36px;text-align:center;border-top:1px solid #f3f4f6;">${FTR}</td></tr></table></td></tr></table></center></body></html>`
}

// ─── Factory: Newsletter ──────────────────────────────────────────────────────
interface NL { title:string; sub?:string; ac:string; bg?:string; items:{h:string;p:string;link?:string}[] }
function newsletter(o:NL):string{
  const bg=o.bg||'#f4f4f4'
  const rows=o.items.map((a,i)=>`<tr><td style="padding:${i>0?'24px 0 0':'0'}">${i>0?'<hr style="border:none;border-top:1px solid #f3f4f6;margin:0 0 24px;">':''}<h2 class="h2" style="color:#111827;font-family:Arial,sans-serif;font-size:19px;font-weight:700;margin:0 0 8px;">${a.h}</h2><p style="color:#6b7280;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;margin:0 0 10px;">${a.p}</p>${a.link?`<a href="#" style="color:${o.ac};font-family:Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;">${a.link} →</a>`:''}</td></tr>`).join('')
  return `${HEAD(o.title)}<body style="margin:0;padding:0;background:${bg};"><center><table class="eo" role="presentation" width="100%" style="padding:28px 12px;"><tr><td><table class="ec" role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);"><tr><td class="eh" style="background:${o.ac};padding:32px 36px;"><h1 class="h1" style="color:#fff;margin:0;font-family:Arial,sans-serif;font-size:22px;font-weight:700;line-height:1.3;word-break:break-word;">${o.title}</h1>${o.sub?`<p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;">${o.sub}</p>`:''}</td></tr><tr><td class="eb" style="padding:32px 36px;"><table role="presentation" width="100%">${rows}</table></td></tr><tr><td class="ef" style="padding:20px 36px;text-align:center;border-top:1px solid #f3f4f6;">${FTR}</td></tr></table></td></tr></table></center></body></html>`
}

// ─── Factory: Transactional ───────────────────────────────────────────────────
interface TX { title:string; sub?:string; body:string; ac:string; icon?:string; rows?:{l:string;v:string}[]; cta?:string; bg?:string }
function trans(o:TX):string{
  const bg=o.bg||'#f4f4f4'
  const rows=o.rows?`<table role="presentation" width="100%" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">${o.rows.map(r=>`<tr><td class="tdl" style="padding:11px 16px;border-bottom:1px solid #f3f4f6;font-family:Arial,sans-serif;font-size:14px;color:#6b7280;width:45%;">${r.l}</td><td class="tdv" style="padding:11px 16px;border-bottom:1px solid #f3f4f6;font-family:Arial,sans-serif;font-size:14px;color:#111827;font-weight:600;text-align:right;word-break:break-word;">${r.v}</td></tr>`).join('')}</table>`:''
  return `${HEAD(o.title)}<body style="margin:0;padding:0;background:${bg};"><center><table class="eo" role="presentation" width="100%" style="padding:28px 12px;"><tr><td><table class="ec" role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);"><tr><td class="eh" style="background:${o.ac};padding:36px;text-align:center;">${o.icon?`<div style="font-size:44px;margin-bottom:12px;">${o.icon}</div>`:''}<h1 class="h1" style="color:#fff;margin:0;font-family:Arial,sans-serif;font-size:24px;font-weight:700;word-break:break-word;">${o.title}</h1>${o.sub?`<p style="color:rgba(255,255,255,0.88);margin:8px 0 0;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;">${o.sub}</p>`:''}</td></tr><tr><td class="eb" style="padding:28px 36px;"><p style="color:#374151;font-family:Arial,sans-serif;font-size:16px;line-height:1.75;margin:0 0 20px;">${o.body}</p>${rows}${o.cta?`<table role="presentation" width="100%"><tr><td style="text-align:center;padding:4px 0;"><a href="#" class="btn" style="display:inline-block;background:${o.ac};color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;font-size:16px;">${o.cta}</a></td></tr></table>`:''}</td></tr><tr><td class="ef" style="padding:20px 36px;text-align:center;border-top:1px solid #f3f4f6;">${FTR}</td></tr></table></td></tr></table></center></body></html>`
}

// ─── Factory: Minimal ─────────────────────────────────────────────────────────
interface MN { from:string; title:string; body:string; cta?:string; ac:string; bg?:string }
function minimal(o:MN):string{
  const bg=o.bg||'#fff'
  return `${HEAD(o.title)}<body style="margin:0;padding:0;background:${bg};"><center><table class="eo" role="presentation" width="100%" style="padding:32px 16px;"><tr><td><table role="presentation" width="100%" style="max-width:560px;margin:0 auto;"><tr><td style="padding-bottom:24px;border-bottom:3px solid ${o.ac};"><p style="margin:0;font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:${o.ac};text-transform:uppercase;letter-spacing:1.5px;word-break:break-word;">${o.from}</p></td></tr><tr><td style="padding:28px 0;"><h1 class="h1" style="color:#111827;font-family:Arial,sans-serif;font-size:26px;font-weight:700;line-height:1.3;margin:0 0 16px;word-break:break-word;">${o.title}</h1><div style="color:#4b5563;font-family:Arial,sans-serif;font-size:16px;line-height:1.8;">${o.body}</div>${o.cta?`<div style="margin-top:28px;"><a href="#" class="btn" style="display:inline-block;background:${o.ac};color:#fff;padding:13px 28px;border-radius:6px;text-decoration:none;font-family:Arial,sans-serif;font-weight:600;font-size:15px;">${o.cta}</a></div>`:''}</td></tr><tr><td style="padding-top:20px;border-top:1px solid #e5e7eb;">${FTR}</td></tr></table></td></tr></table></center></body></html>`
}

// ─── Factory: Product spotlight ───────────────────────────────────────────────
interface PR { title:string; tag?:string; body:string; feats:string[]; cta:string; ac:string; badge?:string; bg?:string }
function product(o:PR):string{
  const bg=o.bg||'#f4f4f4'
  const feats=o.feats.map(f=>`<tr><td style="padding:7px 0;"><table role="presentation" width="100%"><tr><td width="28" style="vertical-align:top;"><div style="width:20px;height:20px;background:${o.ac};border-radius:50%;text-align:center;line-height:20px;"><span style="color:#fff;font-size:11px;font-weight:700;">✓</span></div></td><td style="font-family:Arial,sans-serif;font-size:15px;color:#374151;line-height:1.5;vertical-align:middle;">${f}</td></tr></table></td></tr>`).join('')
  return `${HEAD(o.title)}<body style="margin:0;padding:0;background:${bg};"><center><table class="eo" role="presentation" width="100%" style="padding:28px 12px;"><tr><td><table class="ec" role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);"><tr><td class="eh" style="background:linear-gradient(135deg,${o.ac},${o.ac}cc);padding:44px 36px;text-align:center;">${o.badge?`<div style="display:inline-block;background:rgba(255,255,255,0.2);color:#fff;border:2px solid rgba(255,255,255,0.4);padding:5px 12px;border-radius:100px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;white-space:nowrap;">${o.badge}</div><br>`:''}<h1 class="h1" style="color:#fff;margin:0 0 10px;font-family:Arial,sans-serif;font-size:28px;font-weight:800;word-break:break-word;">${o.title}</h1>${o.tag?`<p style="color:rgba(255,255,255,0.88);margin:0;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;">${o.tag}</p>`:''}</td></tr><tr><td class="eb" style="padding:36px;"><p style="color:#374151;font-family:Arial,sans-serif;font-size:16px;line-height:1.75;margin:0 0 18px;">${o.body}</p><table role="presentation" width="100%" style="margin-bottom:24px;">${feats}</table><table role="presentation" width="100%"><tr><td style="text-align:center;padding:4px 0;"><a href="#" class="btn" style="display:inline-block;background:${o.ac};color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;font-size:16px;">${o.cta}</a></td></tr></table></td></tr><tr><td class="ef" style="padding:20px 36px;text-align:center;border-top:1px solid #f3f4f6;">${FTR}</td></tr></table></td></tr></table></center></body></html>`
}

// ─── Factory: Event ───────────────────────────────────────────────────────────
interface EV { title:string; sub?:string; body:string; date:string; time:string; loc?:string; cta:string; ac:string; speakers?:string[]; bg?:string }
function evnt(o:EV):string{
  const bg=o.bg||'#f4f4f4'
  const spk=o.speakers?`<div style="margin-top:18px;"><p style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Speakers</p>${o.speakers.map(s=>`<span style="display:inline-block;background:#f9fafb;border:1px solid #e5e7eb;padding:5px 12px;border-radius:100px;font-family:Arial,sans-serif;font-size:13px;color:#374151;margin:0 6px 6px 0;">${s}</span>`).join('')}</div>`:''
  return `${HEAD(o.title)}<body style="margin:0;padding:0;background:${bg};"><center><table class="eo" role="presentation" width="100%" style="padding:28px 12px;"><tr><td><table class="ec" role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);"><tr><td class="eh" style="background:${o.ac};padding:44px 36px;text-align:center;"><div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:100px;padding:6px 14px;margin-bottom:14px;"><span style="color:#fff;font-family:Arial,sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">📅 ${o.date}</span></div><h1 class="h1" style="color:#fff;margin:0 0 10px;font-family:Arial,sans-serif;font-size:26px;font-weight:700;word-break:break-word;">${o.title}</h1>${o.sub?`<p style="color:rgba(255,255,255,0.88);margin:0;font-family:Arial,sans-serif;font-size:14px;">${o.sub}</p>`:''}</td></tr><tr><td class="ep" style="padding:12px 36px;"><table role="presentation" width="100%" style="background:#f9fafb;border-radius:8px;"><tr><td class="evd" style="padding:14px 16px;text-align:center;border-right:1px solid #e5e7eb;width:${o.loc?'50%':'100%'};"><p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Time</p><p style="margin:4px 0 0;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#111827;word-break:break-word;">${o.time}</p></td>${o.loc?`<td class="evd" style="padding:14px 16px;text-align:center;width:50%;"><p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Location</p><p style="margin:4px 0 0;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#111827;word-break:break-word;">${o.loc}</p></td>`:''}</tr></table></td></tr><tr><td class="eb" style="padding:24px 36px 36px;"><p style="color:#374151;font-family:Arial,sans-serif;font-size:16px;line-height:1.75;margin:0 0 18px;">${o.body}</p>${spk}<table role="presentation" width="100%" style="margin-top:24px;"><tr><td style="text-align:center;padding:4px 0;"><a href="#" class="btn" style="display:inline-block;background:${o.ac};color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;font-size:16px;">${o.cta}</a></td></tr></table></td></tr><tr><td class="ef" style="padding:20px 36px;text-align:center;border-top:1px solid #f3f4f6;">${FTR}</td></tr></table></td></tr></table></center></body></html>`
}

// ─── Factory: Two-column icon boxes ──────────────────────────────────────────
interface TC { title:string; sub?:string; ac:string; bg?:string; cta?:string; cols:{icon:string;title:string;text:string}[] }
function twocol(o:TC):string{
  const bg=o.bg||'#f4f4f4'
  const pairs:string[]=[]
  for(let i=0;i<o.cols.length;i+=2){
    const L=o.cols[i],R=o.cols[i+1]
    pairs.push(`<tr class="tcr"><td class="col" style="width:50%;padding:8px;vertical-align:top;box-sizing:border-box;"><div style="background:#f9fafb;border-radius:10px;padding:20px;text-align:center;"><div style="font-size:32px;margin-bottom:10px;">${L.icon}</div><h3 class="h3" style="color:#111827;font-family:Arial,sans-serif;font-size:15px;font-weight:700;margin:0 0 7px;">${L.title}</h3><p style="color:#6b7280;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;margin:0;">${L.text}</p></div></td>${R?`<td class="col" style="width:50%;padding:8px;vertical-align:top;box-sizing:border-box;"><div style="background:#f9fafb;border-radius:10px;padding:20px;text-align:center;"><div style="font-size:32px;margin-bottom:10px;">${R.icon}</div><h3 class="h3" style="color:#111827;font-family:Arial,sans-serif;font-size:15px;font-weight:700;margin:0 0 7px;">${R.title}</h3><p style="color:#6b7280;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;margin:0;">${R.text}</p></div></td>`:'<td style="width:50%;padding:8px;"></td>'}</tr>`)
  }
  return `${HEAD(o.title)}<body style="margin:0;padding:0;background:${bg};"><center><table class="eo" role="presentation" width="100%" style="padding:28px 12px;"><tr><td><table class="ec" role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);"><tr><td class="eh" style="background:${o.ac};padding:36px;text-align:center;"><h1 class="h1" style="color:#fff;margin:0;font-family:Arial,sans-serif;font-size:24px;font-weight:700;word-break:break-word;">${o.title}</h1>${o.sub?`<p style="color:rgba(255,255,255,0.88);margin:10px 0 0;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;">${o.sub}</p>`:''}</td></tr><tr><td style="padding:16px 16px ${o.cta?'8px':'16px'};"><table role="presentation" width="100%">${pairs.join('')}</table></td></tr>${o.cta?`<tr><td style="padding:8px 36px 32px;text-align:center;"><a href="#" class="btn" style="display:inline-block;background:${o.ac};color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;font-size:16px;">${o.cta}</a></td></tr>`:''}<tr><td class="ef" style="padding:20px 36px;text-align:center;border-top:1px solid #f3f4f6;">${FTR}</td></tr></table></td></tr></table></center></body></html>`
}

// ─── 107 Templates ────────────────────────────────────────────────────────────
export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [

  // ── WELCOME (10) ────────────────────────────────────────────────────────────
  { id:'w01', name:'Warm Welcome', category:'welcome', accentColor:'#2563eb', description:'Classic welcome for new subscribers',
    html:banner({ac:'#2563eb',title:'Welcome to {{company_name}}! 🎉',sub:'We\'re thrilled to have you on board.',body:'Hi {{first_name}},<br><br>Thank you for joining us. You\'re now part of an amazing community of people who share your passion. We\'ve put together everything you need to get started on the right foot.<br><br>Here\'s what you can look forward to: exclusive content, early access to new features, and personalised tips delivered straight to your inbox.',cta:'Explore Your Dashboard',pre:'Welcome! Here\'s what to expect from us.'})},

  { id:'w02', name:'Getting Started Guide', category:'welcome', accentColor:'#7c3aed', description:'Step-by-step onboarding with icon cards',
    html:twocol({ac:'#7c3aed',title:'Let\'s Get You Started',sub:'Three simple steps to unlock everything.',cta:'Go to My Account',cols:[{icon:'👤',title:'Complete Your Profile',text:'Add your details so we can personalise your experience.'},{icon:'🔔',title:'Set Preferences',text:'Choose what you want to hear about and how often.'},{icon:'🚀',title:'Explore Features',text:'Dive into everything we have built for you.'},{icon:'🎁',title:'Claim Your Bonus',text:'First-time users get exclusive perks — don\'t miss out.'}]})},

  { id:'w03', name:'Welcome Gift', category:'welcome', accentColor:'#059669', description:'Welcome with a discount code for new members',
    html:banner({ac:'#059669',title:'Here\'s a Gift For You 🎁',sub:'A special offer just for joining.',body:'Hi {{first_name}},<br><br>To celebrate you joining our community, we\'re giving you an exclusive discount on your first order. Use the code below at checkout — it\'s our way of saying thank you for choosing us.',cta:'Shop Now & Save',code:'WELCOME20',pre:'Your welcome gift is inside!'})},

  { id:'w04', name:'Account Activated', category:'welcome', accentColor:'#0d9488', description:'Account activation confirmation with summary',
    html:trans({ac:'#0d9488',icon:'✅',title:'Your Account Is Active',sub:'You\'re all set and ready to go.',body:'Hi {{first_name}}, your account has been successfully created and verified. Here\'s a summary of what\'s been set up for you:',rows:[{l:'Account Name',v:'{{full_name}}'},{l:'Email Address',v:'{{email}}'},{l:'Plan',v:'Free Starter'},{l:'Member Since',v:'{{date}}'}],cta:'Log In to Your Account'})},

  { id:'w05', name:'Welcome Aboard', category:'welcome', accentColor:'#4f46e5', description:'Warm welcome for newly onboarded users',
    html:banner({ac:'#4f46e5',title:'You\'re In! Welcome Aboard 🚀',sub:'Your journey starts today.',body:'Hi {{first_name}},<br><br>We\'re so excited to have you with us. Our platform is built to help you achieve your goals faster, and we\'ll be with you every step of the way. Our team is always here if you need anything — just hit reply to this email.',cta:'Start Your Journey',pre:'You\'re officially in. Welcome!'})},

  { id:'w06', name:'VIP Member Welcome', category:'welcome', accentColor:'#d97706', description:'Premium welcome for VIP or paid members',
    html:banner({ac:'#d97706',badge:'VIP Member',title:'Welcome to the Inner Circle',sub:'Exclusive benefits await you.',body:'Hi {{first_name}},<br><br>As a VIP member you get access to things the rest of the world doesn\'t see yet — early product drops, private sales, priority support, and members-only content. We want to make sure you feel the difference from day one.',cta:'Access VIP Dashboard',pre:'Your VIP membership is now active.'})},

  { id:'w07', name:'Community Welcome', category:'welcome', accentColor:'#db2777', description:'Warm welcome into a community or forum',
    html:twocol({ac:'#db2777',title:'Welcome to the Community!',sub:'You\'re now part of something special.',cta:'Meet the Community',cols:[{icon:'💬',title:'Join the Discussion',text:'Ask questions, share ideas, and connect with fellow members.'},{icon:'📚',title:'Browse Resources',text:'Access our library of guides, tutorials, and templates.'},{icon:'🤝',title:'Find Your People',text:'Discover groups that match your interests and goals.'},{icon:'🏆',title:'Earn Rewards',text:'Be active and unlock badges, perks, and recognition.'}]})},

  { id:'w08', name:'Free Trial Started', category:'welcome', accentColor:'#0891b2', description:'Trial kickoff with key details',
    html:trans({ac:'#0891b2',icon:'⏱️',title:'Your 14-Day Trial Has Begun',sub:'Make the most of every day.',body:'Hi {{first_name}}, your free trial is now live. You have full access to all premium features for the next 14 days — no credit card needed, no strings attached.',rows:[{l:'Trial Period',v:'14 Days'},{l:'Access Level',v:'Full Premium'},{l:'Trial Ends',v:'{{trial_end_date}}'},{l:'Credit Card Required',v:'No'}],cta:'Explore Premium Features'})},

  { id:'w09', name:'Referral Welcome', category:'welcome', accentColor:'#7c3aed', description:'Welcome email for users who joined via referral',
    html:banner({ac:'#7c3aed',title:'You Were Invited! 🤝',sub:'{{referrer_name}} thought you\'d love this.',body:'Hi {{first_name}},<br><br>Your friend {{referrer_name}} invited you to join because they thought you\'d find value here. And as a thank-you to both of you, we\'re giving you both a special bonus. You\'re starting with extra credits in your account.',cta:'Claim Your Bonus',pre:'You have a special welcome gift from your friend.'})},

  { id:'w10', name:'Email Confirmation', category:'welcome', accentColor:'#374151', description:'Double opt-in confirmation email',
    html:minimal({from:'Email Confirmation',ac:'#374151',title:'Please Confirm Your Email Address',body:'<p>Hi {{first_name}},</p><p>You\'re almost there. Click the button below to confirm your email address and activate your account. This link will expire in 24 hours.</p><p>If you didn\'t sign up for an account, you can safely ignore this email.</p>',cta:'Confirm My Email Address'})},

  // ── NEWSLETTER (12) ─────────────────────────────────────────────────────────
  { id:'nl01', name:'Weekly Digest', category:'newsletter', accentColor:'#1d4ed8', description:'Weekly roundup newsletter with multiple articles',
    html:newsletter({ac:'#1d4ed8',title:'Your Weekly Digest 📰',sub:'The best of this week, curated for you.',items:[{h:'Top Story: Industry Shifts Ahead',p:'The landscape is changing fast. Here\'s what the latest data tells us about where things are headed and what you can do to stay ahead of the curve.',link:'Read full story'},{h:'3 Tools Worth Trying This Week',p:'We tested a dozen new tools so you don\'t have to. These three stood out for their simplicity, power, and price point.',link:'See the tools'},{h:'Quick Tip: Save 2 Hours Every Week',p:'One small process change that our readers say has transformed their workflow. Takes 10 minutes to set up.',link:'See the tip'}]})},

  { id:'nl02', name:'Monthly Update', category:'newsletter', accentColor:'#065f46', description:'Monthly company or product update newsletter',
    html:newsletter({ac:'#065f46',title:'Monthly Update — {{month}} {{year}}',sub:'Here\'s everything that happened this month.',items:[{h:'What We Shipped',p:'This month we launched three major updates based on your feedback. Here\'s a breakdown of what\'s new and how it helps you.',link:'See what\'s new'},{h:'Numbers That Matter',p:'Growth, engagement, and the metrics that show us we\'re on the right path. Transparency is important to us.',link:'View the report'},{h:'What\'s Coming Next Month',p:'A sneak peek at what the team is building. We\'re particularly excited about one feature we think you\'ll love.',link:'See the roadmap'}]})},

  { id:'nl03', name:'Tech Roundup', category:'newsletter', accentColor:'#5b21b6', description:'Technology and developer-focused newsletter',
    html:newsletter({ac:'#5b21b6',title:'Tech Roundup ⚡',sub:'The week in tech, distilled.',items:[{h:'AI Tools That Are Actually Useful',p:'Cutting through the noise to find the AI-powered tools that are genuinely saving developers time right now.',link:'Explore tools'},{h:'Framework Update: What Changed',p:'The latest release dropped and there are some breaking changes you should know about before upgrading.',link:'Read changelog'},{h:'Open Source Highlight',p:'This week\'s spotlight project has 12k stars and solves a problem every developer has hit at least once.',link:'See the project'}]})},

  { id:'nl04', name:'Marketing Insider', category:'newsletter', accentColor:'#991b1b', description:'Marketing tips and strategy newsletter',
    html:newsletter({ac:'#991b1b',title:'Marketing Insider 📣',sub:'Actionable marketing insights every week.',items:[{h:'Email Subject Lines That Doubled Open Rates',p:'We analysed 50,000 subject lines. The results were surprising. Here are the exact patterns that perform best.',link:'Read the analysis'},{h:'The Funnel Fix Nobody Talks About',p:'Most teams focus on the top of the funnel and ignore where the real leaks are. Here\'s what to fix first.',link:'See the fix'},{h:'Case Study: 10x ROAS in 60 Days',p:'How one brand turned their ad spend around with three simple audience segmentation changes.',link:'Read the case study'}]})},

  { id:'nl05', name:'Product Updates', category:'newsletter', accentColor:'#0f766e', description:'What\'s new in your product this month',
    html:newsletter({ac:'#0f766e',title:'What\'s New in {{product_name}} 🔧',sub:'Updates, improvements, and fixes.',items:[{h:'New Feature: Advanced Filters',p:'You can now filter your data by 20+ parameters simultaneously. Available on all plans starting today.',link:'Try it now'},{h:'Improvement: 3x Faster Export',p:'We rewrote our export engine from scratch. Exports that used to take minutes now take seconds.',link:'Learn more'},{h:'Coming Soon: Mobile App',p:'Our iOS and Android apps are in final testing. Sign up for early access and be the first to try it.',link:'Join the waitlist'}]})},

  { id:'nl06', name:'Startup Insider', category:'newsletter', accentColor:'#9a3412', description:'Startup and entrepreneurship newsletter',
    html:newsletter({ac:'#9a3412',title:'Startup Insider 🚀',sub:'For founders who want to stay ahead.',items:[{h:'Fundraising Trends in Q{{quarter}}',p:'VCs are doubling down on certain sectors while pulling back on others. Where the smart money is going.',link:'Read more'},{h:'Founder Story: From Zero to £2M ARR',p:'An honest conversation about what worked, what failed spectacularly, and what they\'d do differently.',link:'Read the interview'},{h:'Legal Basics Every Founder Should Know',p:'The three legal documents that most early-stage startups get wrong, and how to fix them fast.',link:'Get the checklist'}]})},

  { id:'nl07', name:'Design Weekly', category:'newsletter', accentColor:'#be185d', description:'Design inspiration and tools newsletter',
    html:newsletter({ac:'#be185d',title:'Design Weekly 🎨',sub:'Inspiration, tools, and resources for designers.',items:[{h:'UI Trend: Bento Grid Layouts',p:'Why bento-style grids are taking over product pages and landing sites, and how to use them effectively.',link:'See examples'},{h:'Free Resource: Icon Pack (800+ icons)',p:'A beautiful open-source icon set that works across Figma, Illustrator, and code. Completely free.',link:'Download free'},{h:'Typography Pairing Guide',p:'12 proven font combinations that professional designers use. Works for web, print, and branding.',link:'See the pairings'}]})},

  { id:'nl08', name:'Business Brief', category:'newsletter', accentColor:'#1e3a5f', description:'Business and finance newsletter',
    html:newsletter({ac:'#1e3a5f',title:'Business Brief 💼',sub:'The financial and business news you need.',items:[{h:'Market Update: Key Numbers This Week',p:'Here\'s what the movement means for small business owners and investors alike.',link:'Full analysis'},{h:'Productivity: The 4-Day Work Week Data',p:'New research from 100 companies shows the real impact on output, revenue, and employee retention.',link:'See the data'},{h:'Tax Planning: Act Before Year-End',p:'Four moves to make before December 31st that can significantly reduce your tax burden.',link:'Read the tips'}]})},

  { id:'nl09', name:'Wellness Weekly', category:'newsletter', accentColor:'#15803d', description:'Health, wellness, and lifestyle newsletter',
    html:newsletter({ac:'#15803d',title:'Wellness Weekly 🌿',sub:'Small habits, big results.',items:[{h:'The 5-Minute Morning Routine That Works',p:'Science-backed. Takes five minutes. Thousands of our readers say it\'s changed their mornings completely.',link:'Try it'},{h:'Nutrition Myth Debunked',p:'One of the most widely shared nutrition "facts" turns out to be not quite what it seems. Here\'s the real story.',link:'Read more'},{h:'Movement Snacks: Exercise Without the Gym',p:'Four micro-movements you can do at your desk that add up to real fitness gains over time.',link:'See the moves'}]})},

  { id:'nl10', name:'E-commerce Insights', category:'newsletter', accentColor:'#0369a1', description:'E-commerce and retail newsletter',
    html:newsletter({ac:'#0369a1',title:'E-commerce Insights 🛍️',sub:'Grow your store with data-driven strategies.',items:[{h:'Conversion Rate Benchmarks by Industry',p:'How does your store stack up? We collected data from 3,000 stores across 12 categories.',link:'See the benchmarks'},{h:'Abandoned Cart: The 3-Email Sequence That Recovers 28%',p:'The exact timing, copy, and incentives used by top-performing stores to win back lost revenue.',link:'Get the sequence'},{h:'Seasonal Prep Checklist for Q4',p:'The 20-point checklist that 7-figure stores use to prepare for Black Friday and the holiday rush.',link:'Download checklist'}]})},

  { id:'nl11', name:'Education Newsletter', category:'newsletter', accentColor:'#6d28d9', description:'Learning and education-focused newsletter',
    html:newsletter({ac:'#6d28d9',title:'Learn Something New 📚',sub:'Curated learning, delivered weekly.',items:[{h:'Course of the Week: Data Analysis in 30 Days',p:'A structured 30-day programme that takes you from zero to confident. Free access for newsletter subscribers.',link:'Enrol free'},{h:'Podcast Highlight: The Learning Scientist',p:'This episode breaks down the research on spaced repetition and why most people are studying wrong.',link:'Listen now'},{h:'Reading List: 5 Books on Critical Thinking',p:'Five books that changed how our team thinks through complex problems. Concise summaries included.',link:'Get the list'}]})},

  { id:'nl12', name:'The Brief', category:'newsletter', accentColor:'#111827', description:'Minimal text-only newsletter format',
    html:minimal({from:'The Brief by {{company_name}}',ac:'#111827',title:'This Week\'s Most Important Ideas',body:'<p>Hi {{first_name}},</p><p>Three things worth your attention this week:</p><p><strong>1. The compounding effect of small actions.</strong> A 1% improvement every day leads to 37x better results in a year. The small choices you make consistently matter far more than occasional big ones.</p><p><strong>2. Ask better questions.</strong> The quality of your thinking is directly tied to the quality of questions you ask yourself. What question should you be asking that you\'ve been avoiding?</p><p><strong>3. Ship before you\'re ready.</strong> Waiting for perfect is the enemy of done. Every successful product started as an embarrassing first version.</p>',cta:'Reply With Your Thoughts'})},

  // ── PROMOTIONAL (15) ────────────────────────────────────────────────────────
  { id:'p01', name:'Flash Sale', category:'promotional', accentColor:'#dc2626', description:'Urgent flash sale with code',
    html:banner({ac:'#dc2626',badge:'⚡ Flash Sale — Today Only',title:'Up to 50% Off Everything',sub:'Sale ends at midnight. Don\'t miss it.',body:'Hi {{first_name}},<br><br>We\'re running a one-day flash sale and everything in our store is discounted. These prices won\'t come back, so now is the time to grab what you\'ve been eyeing. Use the code below at checkout.',cta:'Shop the Sale Now',code:'FLASH50',pre:'⚡ Flash Sale — up to 50% off today only!'})},

  { id:'p02', name:'Limited Time Offer', category:'promotional', accentColor:'#ea580c', description:'48-hour time-limited offer',
    html:banner({ac:'#ea580c',badge:'Limited Time',title:'This Offer Expires in 48 Hours',sub:'Get {{discount}}% off before time runs out.',body:'Hi {{first_name}},<br><br>We\'ve put together a special offer that\'s only available for the next 48 hours. Once the timer runs out, this deal disappears. Whether you\'ve been sitting on the fence or you\'re ready to jump in — now is the time.',cta:'Grab the Deal',disc:'{{discount}}% OFF',pre:'Your 48-hour offer is waiting.'})},

  { id:'p03', name:'Buy One Get One', category:'promotional', accentColor:'#7c3aed', description:'BOGO promotional email',
    html:banner({ac:'#7c3aed',badge:'BOGO',title:'Buy One, Get One Free',sub:'Double the value — same great products.',body:'Hi {{first_name}},<br><br>For this weekend only, every purchase automatically comes with a second item free. Add two items to your cart, apply the code at checkout, and the lower-priced item is on us. Share with a friend and you both benefit!',cta:'Shop BOGO Now',code:'BOGO2024',pre:'Buy one, get one FREE this weekend!'})},

  { id:'p04', name:'Seasonal Sale', category:'promotional', accentColor:'#16a34a', description:'Seasonal sale announcement',
    html:banner({ac:'#16a34a',badge:'Seasonal Sale',title:'Season\'s Best Deals Are Here',sub:'Save big on our most popular products.',body:'Hi {{first_name}},<br><br>The season is here and so are our biggest sales of the year. We\'ve marked down our bestselling products and added new items to the mix. Stock is limited — once it\'s gone, it\'s gone.',cta:'See All Deals',disc:'30% OFF',pre:'Seasonal sale — our biggest of the year!'})},

  { id:'p05', name:'Clearance Event', category:'promotional', accentColor:'#b45309', description:'End-of-season clearance sale',
    html:banner({ac:'#b45309',badge:'Clearance',title:'Final Clearance — Up to 70% Off',sub:'Everything must go. Final sale prices.',body:'Hi {{first_name}},<br><br>We\'re clearing out our inventory to make way for new arrivals. This means massive savings for you — up to 70% off on hundreds of items. All sales are final, so act fast before your size or choice is gone.',cta:'Shop Clearance',disc:'70% OFF',pre:'Up to 70% off — final clearance sale.'})},

  { id:'p06', name:'VIP Early Access', category:'promotional', accentColor:'#d97706', description:'Early access sale for VIP members',
    html:banner({ac:'#d97706',badge:'🌟 VIP Access',title:'You\'re In Before Everyone Else',sub:'Our sale opens to the public in 24 hours. You\'re first.',body:'Hi {{first_name}},<br><br>As a valued member of our community, you get 24-hour early access to our sale before we open it to everyone else. The best stock goes first, so don\'t wait. This link is exclusive to you.',cta:'Shop Early Access Now',pre:'VIP early access — shop before the public.'})},

  { id:'p07', name:'Members-Only Sale', category:'promotional', accentColor:'#1e3a5f', description:'Exclusive private sale for members',
    html:banner({ac:'#1e3a5f',badge:'Members Only',title:'A Sale Just for Our Members',sub:'This deal never appears publicly.',body:'Hi {{first_name}},<br><br>This email is the only way to access this sale. We don\'t advertise it anywhere — it\'s exclusively for people like you. Use your member code to unlock the discount.',cta:'Unlock My Member Price',code:'MEMBER15',pre:'A private sale — just for our members.'})},

  { id:'p08', name:'Weekend Deal', category:'promotional', accentColor:'#db2777', description:'Friday to Sunday weekend sale',
    html:banner({ac:'#db2777',badge:'Weekend Only',title:'Your Weekend Just Got Better 🎉',sub:'Special pricing from Friday to Sunday.',body:'Hi {{first_name}},<br><br>Kick off your weekend with some great deals. We\'ve selected our most popular items and slashed the prices — but only until Sunday midnight. Make it count!',cta:'Weekend Shopping →',op:'£99',sp:'£59',pre:'Weekend deals are live — shop now.'})},

  { id:'p09', name:'Black Friday', category:'promotional', accentColor:'#111827', description:'Black Friday mega sale campaign',
    html:banner({ac:'#111827',badge:'BLACK FRIDAY',title:'Our Biggest Sale of the Year',sub:'Up to 60% off sitewide. Today only.',body:'Hi {{first_name}},<br><br>Black Friday is here and we\'re going all in. This is the one day of the year where we pull out all the stops. Every category, every product — discounted. The clock is ticking.',cta:'Shop Black Friday Deals',disc:'60% OFF',code:'BF60',pre:'Black Friday is here. Up to 60% off today!'})},

  { id:'p10', name:'Cyber Monday', category:'promotional', accentColor:'#1d4ed8', description:'Cyber Monday digital-focused sale',
    html:banner({ac:'#1d4ed8',badge:'CYBER MONDAY',title:'Digital Deals for Cyber Monday',sub:'Online-only prices you won\'t find in store.',body:'Hi {{first_name}},<br><br>Cyber Monday is here and we\'re celebrating with our deepest online-only discounts. These prices exist only on our website for the next 24 hours. Load up your cart and check out before midnight.',cta:'Shop Cyber Monday',disc:'40% OFF',pre:'Cyber Monday deals are live — online only!'})},

  { id:'p11', name:'Holiday Sale', category:'promotional', accentColor:'#b91c1c', description:'Holiday season promotional sale',
    html:banner({ac:'#b91c1c',badge:'🎄 Holiday Sale',title:'Joy, Cheer & Great Savings',sub:'Gifts for everyone on your list.',body:'Hi {{first_name}},<br><br>The holiday season is the perfect time to treat yourself and the people you love. We\'ve curated the best gift ideas across every budget and slashed the prices so you can celebrate without the stress.',cta:'Shop Holiday Gifts',op:'£150',sp:'£89',pre:'Holiday sale — gifts for everyone.'})},

  { id:'p12', name:'New Year Deal', category:'promotional', accentColor:'#92400e', description:'New Year promotion',
    html:banner({ac:'#92400e',badge:'New Year Special',title:'New Year, New Deals 🥂',sub:'Start the year with something great.',body:'Hi {{first_name}},<br><br>A new year means a fresh start — and we want to help you kick it off right. We\'ve put together a special offer exclusively for the first days of the year. Invest in yourself for {{year}}.',cta:'Start the Year Right',disc:'25% OFF',pre:'New Year deals — start strong.'})},

  { id:'p13', name:'Summer Sale', category:'promotional', accentColor:'#e11d48', description:'Summer promotional campaign',
    html:banner({ac:'#e11d48',badge:'☀️ Summer Sale',title:'Hot Summer Deals Are Here',sub:'Cool prices for the hottest season.',body:'Hi {{first_name}},<br><br>Summer is in full swing and so are our discounts. We\'ve stocked up on everything you need for the season and knocked prices down to match the heat outside. Get your summer sorted.',cta:'Shop Summer Deals',disc:'35% OFF',pre:'Summer sale is here — hot deals inside!'})},

  { id:'p14', name:'Back to School Promo', category:'promotional', accentColor:'#854d0e', description:'Back to school season promotion',
    html:banner({ac:'#854d0e',badge:'Back to School',title:'Everything You Need for a Great Year',sub:'The best deals on essentials.',body:'Hi {{first_name}},<br><br>The new school year is just around the corner. Whether you\'re a student, a parent, or a teacher — we\'ve got everything you need at prices that won\'t break the bank. Stock up now before demand peaks.',cta:'Shop Back to School',code:'SCHOOL15',pre:'Back to school deals — save 15% today.'})},

  { id:'p15', name:'Anniversary Sale', category:'promotional', accentColor:'#6d28d9', description:'Company anniversary special promotion',
    html:banner({ac:'#6d28d9',badge:'🎂 Anniversary Sale',title:'We\'re Celebrating — You\'re Invited',sub:'{{years}} years, our best prices ever.',body:'Hi {{first_name}},<br><br>We\'re celebrating our anniversary and we want to share the joy with you. For the next 72 hours, we\'re offering our deepest discounts ever as a thank-you to every customer who has been part of our journey.',cta:'Join the Celebration',disc:'{{years}}% OFF',pre:'It\'s our anniversary — and you get the gift!'})},

  // ── PRODUCT (10) ────────────────────────────────────────────────────────────
  { id:'pr01', name:'New Product Launch', category:'product', accentColor:'#1d4ed8', description:'Major new product announcement',
    html:product({ac:'#1d4ed8',badge:'New Release',title:'Introducing {{product_name}}',tag:'The product you\'ve been waiting for.',body:'We\'ve been building this for months and we can\'t wait for you to try it. {{product_name}} is designed to solve the biggest problems our community faces — and we think it does it better than anything else out there.',feats:['Built on feedback from 10,000+ users','Works seamlessly with your existing tools','Available on web, iOS, and Android','Priority support for first 30 days'],cta:'Try It Free Now'})},

  { id:'pr02', name:'Feature Announcement', category:'product', accentColor:'#4338ca', description:'New feature release for existing users',
    html:twocol({ac:'#4338ca',title:'New Features Just Dropped 🚀',sub:'Here\'s what you can do now.',cta:'Explore New Features',cols:[{icon:'⚡',title:'2x Faster',text:'The new engine processes your data in half the time.'},{icon:'🎨',title:'Custom Themes',text:'Make it yours with fully customisable colour themes.'},{icon:'🔗',title:'New Integrations',text:'Now connects with Slack, Notion, and 20 more tools.'},{icon:'📊',title:'Advanced Analytics',text:'Deeper insights with real-time dashboards.'}]})},

  { id:'pr03', name:'Product Update', category:'product', accentColor:'#059669', description:'Product update and improvements email',
    html:product({ac:'#059669',badge:'v{{version}} Update',title:'We Just Made Things Better',tag:'Your feedback shaped every change.',body:'This update is the result of listening carefully to what you\'ve been telling us. We focused on speed, reliability, and the small details that make a big difference to how you work every day.',feats:['Fixed 47 bugs reported by the community','Response time improved by 65%','New keyboard shortcuts for power users','Redesigned settings panel'],cta:'See What\'s New'})},

  { id:'pr04', name:'App Launch', category:'product', accentColor:'#7c3aed', description:'Mobile app launch announcement',
    html:banner({ac:'#7c3aed',badge:'Now Available',title:'Our App Is Finally Here 📱',sub:'Everything you love, now in your pocket.',body:'Hi {{first_name}},<br><br>The day is finally here. Our mobile app is live on the App Store and Google Play. Everything you use on desktop is now optimised for mobile — and we\'ve added some features that are only possible on mobile.',cta:'Download the App Now',pre:'Our mobile app is finally live!'})},

  { id:'pr05', name:'Coming Soon Teaser', category:'product', accentColor:'#ea580c', description:'Coming soon teaser for upcoming product',
    html:banner({ac:'#ea580c',badge:'Coming Soon',title:'Something Big Is Coming',sub:'You\'re among the first to know.',body:'Hi {{first_name}},<br><br>We\'ve been working on something we believe will change how you work. We\'re not quite ready to show you everything yet — but we want you to be first in line when we do. Join the waitlist to get early access.',cta:'Join the Waitlist',pre:'Something big is coming — be first to know.'})},

  { id:'pr06', name:'Beta Access Invite', category:'product', accentColor:'#0891b2', description:'Private beta program invitation',
    html:banner({ac:'#0891b2',badge:'🧪 Beta Access',title:'You\'re Invited to Test Our Beta',sub:'Shape the product before it goes public.',body:'Hi {{first_name}},<br><br>We\'ve selected a small group of our most engaged users to test our upcoming product before the public launch. You\'re one of them. Your feedback will directly influence what we ship.',cta:'Accept Beta Invite',pre:'You\'re invited to our private beta.'})},

  { id:'pr07', name:'Product Spotlight', category:'product', accentColor:'#0d9488', description:'Highlight a specific product or feature',
    html:product({ac:'#0d9488',title:'Meet {{product_name}}',tag:'Designed for people like you.',body:'Every product we build starts with a real problem. {{product_name}} exists because we heard the same frustration from thousands of users — and we built the most elegant solution we could.',feats:['Intuitive interface — no training needed','Saves an average of 3 hours per week','Trusted by 50,000+ professionals','30-day money-back guarantee'],cta:'Learn More & Get Started'})},

  { id:'pr08', name:'Waitlist Confirmation', category:'product', accentColor:'#6d28d9', description:'Confirm waitlist signup and set expectations',
    html:trans({ac:'#6d28d9',icon:'🎯',title:'You\'re on the Waitlist!',sub:'We\'ll reach out the moment you\'re in.',body:'Hi {{first_name}}, you\'ve successfully joined the waitlist for {{product_name}}. You\'re number {{waitlist_position}} in line. We\'re rolling out access in batches and will contact you personally when it\'s your turn.',rows:[{l:'Waitlist Position',v:'#{{waitlist_position}}'},{l:'Product',v:'{{product_name}}'},{l:'Estimated Access',v:'{{eta}}'},{l:'Email',v:'{{email}}'}]})},

  { id:'pr09', name:'Deprecation Notice', category:'product', accentColor:'#b45309', description:'Notify users of a feature being discontinued',
    html:trans({ac:'#b45309',icon:'⚠️',title:'Important: {{feature_name}} Is Retiring',sub:'Action required before {{end_date}}.',body:'Hi {{first_name}}, we want to give you plenty of notice that {{feature_name}} will be discontinued on {{end_date}}. We\'re retiring it to focus resources on its much improved replacement.',rows:[{l:'Feature Retiring',v:'{{feature_name}}'},{l:'Retirement Date',v:'{{end_date}}'},{l:'Replacement',v:'{{replacement_name}}'},{l:'Migration Guide',v:'Available in your dashboard'}],cta:'Migrate to the New Version'})},

  { id:'pr10', name:'Collection Drop', category:'product', accentColor:'#111827', description:'New collection or product drop announcement',
    html:banner({ac:'#111827',badge:'New Drop',title:'The {{collection_name}} Collection',sub:'Limited quantities. First come, first served.',body:'Hi {{first_name}},<br><br>Our latest collection just dropped and it\'s unlike anything we\'ve released before. Every item is limited edition — once they\'re gone, they\'re gone for good. We recommend not waiting.',cta:'Shop the Drop Now',pre:'New collection drop — limited quantities.'})},

  // ── E-COMMERCE (12) ─────────────────────────────────────────────────────────
  { id:'ec01', name:'Order Confirmed', category:'ecommerce', accentColor:'#059669', description:'Order confirmation with details',
    html:trans({ac:'#059669',icon:'✅',title:'Order Confirmed!',sub:'Thank you for your purchase.',body:'Hi {{first_name}}, your order has been received and is being processed. Here\'s a summary of what you ordered:',rows:[{l:'Order Number',v:'#{{order_id}}'},{l:'Items Ordered',v:'{{item_count}} items'},{l:'Order Total',v:'{{currency}}{{order_total}}'},{l:'Estimated Delivery',v:'{{delivery_date}}'},{l:'Delivery Address',v:'{{shipping_address}}'}],cta:'Track My Order'})},

  { id:'ec02', name:'Shipping Notification', category:'ecommerce', accentColor:'#2563eb', description:'Order dispatched with tracking info',
    html:trans({ac:'#2563eb',icon:'📦',title:'Your Order Is on Its Way!',sub:'Sit tight — it\'s coming.',body:'Hi {{first_name}}, great news! Your order #{{order_id}} has been dispatched and is heading your way. Use the tracking number below to follow it in real time.',rows:[{l:'Order Number',v:'#{{order_id}}'},{l:'Tracking Number',v:'{{tracking_number}}'},{l:'Carrier',v:'{{carrier_name}}'},{l:'Estimated Arrival',v:'{{delivery_date}}'}],cta:'Track My Package'})},

  { id:'ec03', name:'Out for Delivery', category:'ecommerce', accentColor:'#0d9488', description:'Out for delivery today notification',
    html:trans({ac:'#0d9488',icon:'🚚',title:'Your Order Is Out for Delivery',sub:'It\'ll be with you today!',body:'Hi {{first_name}}, your order #{{order_id}} is out for delivery today and will arrive at your address soon. Make sure someone is available to receive it.',rows:[{l:'Order Number',v:'#{{order_id}}'},{l:'Delivery Date',v:'Today'},{l:'Delivery Window',v:'{{delivery_window}}'},{l:'Address',v:'{{shipping_address}}'}],cta:'See Live Tracking'})},

  { id:'ec04', name:'Abandoned Cart', category:'ecommerce', accentColor:'#dc2626', description:'Recover abandoned shopping carts',
    html:banner({ac:'#dc2626',title:'You Left Something Behind! 🛒',sub:'Your cart is waiting for you.',body:'Hi {{first_name}},<br><br>You had some great items in your cart but didn\'t finish checking out. We saved everything for you. Your items are still available, but we can\'t guarantee they\'ll stay in stock much longer.',cta:'Complete My Purchase',pre:'Your cart is waiting — complete your order.'})},

  { id:'ec05', name:'Cart Recovery + Discount', category:'ecommerce', accentColor:'#7c3aed', description:'Abandoned cart recovery with 10% off',
    html:banner({ac:'#7c3aed',title:'Here\'s 10% Off to Come Back',sub:'Your cart misses you.',body:'Hi {{first_name}},<br><br>We noticed you left something in your cart. To make it easier to complete your purchase, we\'re giving you 10% off — just use the code below at checkout. This offer expires in 24 hours.',cta:'Claim My 10% Off',code:'COMEBACK10',pre:'Come back and save 10% on your cart.'})},

  { id:'ec06', name:'Subscription Confirmed', category:'ecommerce', accentColor:'#16a34a', description:'Subscription activation confirmation',
    html:trans({ac:'#16a34a',icon:'🔄',title:'Subscription Activated',sub:'Welcome to {{plan_name}}.',body:'Hi {{first_name}}, your subscription to {{plan_name}} is now active. You\'ll be charged automatically on your billing date each month. Here are your subscription details:',rows:[{l:'Plan',v:'{{plan_name}}'},{l:'Billing Amount',v:'{{currency}}{{amount}}/month'},{l:'Next Billing Date',v:'{{next_billing_date}}'},{l:'Payment Method',v:'•••• {{last4}}'}],cta:'Manage Subscription'})},

  { id:'ec07', name:'Subscription Renewal', category:'ecommerce', accentColor:'#7c3aed', description:'Upcoming subscription renewal reminder',
    html:trans({ac:'#7c3aed',icon:'📅',title:'Your Subscription Renews Soon',sub:'A heads up before we charge.',body:'Hi {{first_name}}, your {{plan_name}} subscription is due to renew in 3 days. We wanted to give you advance notice before processing the payment. No action is needed if everything looks good.',rows:[{l:'Plan',v:'{{plan_name}}'},{l:'Renewal Amount',v:'{{currency}}{{amount}}'},{l:'Renewal Date',v:'{{renewal_date}}'},{l:'Payment Method',v:'•••• {{last4}}'}],cta:'Manage My Subscription'})},

  { id:'ec08', name:'Refund Processed', category:'ecommerce', accentColor:'#ea580c', description:'Refund confirmation email',
    html:trans({ac:'#ea580c',icon:'💸',title:'Your Refund Has Been Processed',sub:'The money is on its way back.',body:'Hi {{first_name}}, we\'ve processed your refund for order #{{order_id}}. Please allow 3–5 business days for the amount to appear on your statement depending on your bank.',rows:[{l:'Order Number',v:'#{{order_id}}'},{l:'Refund Amount',v:'{{currency}}{{refund_amount}}'},{l:'Refund Method',v:'Original payment method'},{l:'Expected By',v:'{{refund_date}}'}]})},

  { id:'ec09', name:'Back in Stock', category:'ecommerce', accentColor:'#1d4ed8', description:'Back in stock alert email',
    html:banner({ac:'#1d4ed8',title:'It\'s Back! {{product_name}} Is in Stock',sub:'Don\'t miss it this time.',body:'Hi {{first_name}},<br><br>Good news — {{product_name}} is back in stock. You requested to be notified and we wanted you to be the first to know. Stock is limited, so we recommend acting quickly.',cta:'Buy It Now',pre:'{{product_name}} is back in stock!'})},

  { id:'ec10', name:'Price Drop Alert', category:'ecommerce', accentColor:'#b91c1c', description:'Notify customer of price drop on wishlist item',
    html:banner({ac:'#b91c1c',title:'Price Drop on {{product_name}} 📉',sub:'The item you wanted just got cheaper.',body:'Hi {{first_name}},<br><br>{{product_name}} just dropped in price. You saved it to your wishlist — now\'s the perfect time to grab it. We can\'t guarantee this price will last.',cta:'Buy at New Price',op:'{{old_price}}',sp:'{{new_price}}',pre:'Price drop! {{product_name}} is cheaper now.'})},

  { id:'ec11', name:'Wishlist Reminder', category:'ecommerce', accentColor:'#db2777', description:'Remind customers about their wishlist items',
    html:banner({ac:'#db2777',title:'Still Thinking About These? 💕',sub:'Your wishlist is waiting for you.',body:'Hi {{first_name}},<br><br>You saved some great items to your wishlist and we didn\'t want you to forget about them. Some are running low on stock — this might be the right time to treat yourself.',cta:'View My Wishlist',pre:'Your wishlist items are still waiting.'})},

  { id:'ec12', name:'Review Request', category:'ecommerce', accentColor:'#d97706', description:'Post-purchase review request',
    html:banner({ac:'#d97706',title:'How Was Your Order? ⭐',sub:'Your feedback helps everyone.',body:'Hi {{first_name}},<br><br>Your order arrived a few days ago and we\'d love to hear what you think. Your honest review helps other customers make informed decisions — and it only takes two minutes.',cta:'Leave a Review',pre:'Tell us what you think about your order.'})},

  // ── RE-ENGAGEMENT (8) ───────────────────────────────────────────────────────
  { id:'re01', name:'We Miss You', category:'reengagement', accentColor:'#7c3aed', description:'Re-engagement for inactive subscribers',
    html:banner({ac:'#7c3aed',title:'We Miss You, {{first_name}} 💜',sub:'It\'s been a while since we last spoke.',body:'Hi {{first_name}},<br><br>We noticed you haven\'t been around lately and we genuinely miss having you here. A lot has changed since your last visit — new features, new content, and improvements across the board. Come see what you\'ve been missing.',cta:'See What\'s New',pre:'We miss you — come back and see what\'s changed.'})},

  { id:'re02', name:'Comeback Offer', category:'reengagement', accentColor:'#dc2626', description:'Win-back offer for inactive customers',
    html:banner({ac:'#dc2626',badge:'Come Back!',title:'We Want You Back 🎁',sub:'A special offer just for you.',body:'Hi {{first_name}},<br><br>We know you\'ve moved on, and we respect that. But before you go completely, we wanted to make one more offer. We\'ve improved a lot since you last used us, and we\'d love a second chance.',cta:'Redeem My Offer',code:'COMEBACK25',pre:'A special offer to welcome you back.'})},

  { id:'re03', name:'Last Email', category:'reengagement', accentColor:'#991b1b', description:'Final re-engagement before unsubscribing',
    html:minimal({from:'Important — Action Required',ac:'#991b1b',title:'This Is Our Last Message to You',body:'<p>Hi {{first_name}},</p><p>We noticed you haven\'t opened any of our emails in a while. We don\'t want to clutter your inbox, so we\'re reaching out one final time.</p><p>If you\'d like to stay subscribed, click the button below. If not, we\'ll automatically remove you from our list in 7 days.</p><p>We\'ve loved having you here. No hard feelings either way.</p>',cta:'Yes, Keep Me Subscribed'})},

  { id:'re04', name:'Win-back with Freebie', category:'reengagement', accentColor:'#d97706', description:'Win-back with a free gift or resource',
    html:banner({ac:'#d97706',badge:'Free Gift Inside',title:'Here\'s Something Free to Come Back',sub:'No strings attached.',body:'Hi {{first_name}},<br><br>We\'ve been building new things and we created this free resource just for inactive members. Think of it as our way of saying we still care and we want to earn your attention back.',cta:'Get My Free Resource',pre:'A free gift to welcome you back.'})},

  { id:'re05', name:'Reactivate Account', category:'reengagement', accentColor:'#0d9488', description:'Account reactivation prompt',
    html:trans({ac:'#0d9488',icon:'🔓',title:'Your Account Is Still Here',sub:'Pick up right where you left off.',body:'Hi {{first_name}}, your account is still active and everything is exactly as you left it. We\'ve made significant improvements since you last logged in. Reactivating takes one click.',rows:[{l:'Account Status',v:'Active'},{l:'Last Login',v:'{{last_login_date}}'},{l:'Your Data',v:'Fully preserved'},{l:'New Features Added',v:'{{feature_count}}+'}],cta:'Reactivate My Account'})},

  { id:'re06', name:'Survey Before Goodbye', category:'reengagement', accentColor:'#374151', description:'Ask why they\'re leaving before unsubscribing',
    html:minimal({from:'Quick Question',ac:'#374151',title:'Before You Go — Can We Ask Why?',body:'<p>Hi {{first_name}},</p><p>You\'ve unsubscribed from our emails. We completely respect that decision — but it would mean a lot to us if you told us why.</p><p>Your answer takes less than 30 seconds and directly helps us improve. We won\'t email you again unless you ask us to.</p>',cta:'Share My Feedback (30 sec)'})},

  { id:'re07', name:'Dormant User Nudge', category:'reengagement', accentColor:'#4f46e5', description:'Show new features to dormant users',
    html:twocol({ac:'#4f46e5',title:'Look What You\'ve Been Missing',sub:'New features added since your last visit.',cta:'Log Back In Now',cols:[{icon:'✨',title:'New Dashboard',text:'Completely redesigned for clarity and speed.'},{icon:'🔗',title:'20 New Integrations',text:'Connect the tools you already use.'},{icon:'📈',title:'Better Analytics',text:'Understand your results at a glance.'},{icon:'💬',title:'Live Chat Support',text:'Get help instantly, any time of day.'}]})},

  { id:'re08', name:'Reconnect', category:'reengagement', accentColor:'#be185d', description:'Emotional reconnect email for long-absent users',
    html:banner({ac:'#be185d',title:'Remember Us? We Remember You 💕',sub:'A lot has changed. Let us show you.',body:'Hi {{first_name}},<br><br>It\'s been a long time. We\'ve been busy making things better — not just the product, but our community, our support, and the way we communicate with the people who matter most to us. That\'s you.',cta:'Come Back & Explore',pre:'We\'ve been building while you were away.'})},

  // ── EVENTS (10) ─────────────────────────────────────────────────────────────
  { id:'ev01', name:'Webinar Invitation', category:'event', accentColor:'#7c3aed', description:'Webinar invite with date and speakers',
    html:evnt({ac:'#7c3aed',title:'Free Webinar: {{webinar_title}}',sub:'Join us live for an expert-led session.',body:'We\'re hosting a free live webinar packed with actionable insights you can apply immediately. Whether you\'re a beginner or an expert, there\'s something in this session for you.',date:'{{event_date}}',time:'{{event_time}} {{timezone}}',loc:'Live Online (Zoom)',cta:'Reserve My Spot',speakers:['{{speaker_1}}','{{speaker_2}}']})},

  { id:'ev02', name:'Conference Registration', category:'event', accentColor:'#1d4ed8', description:'Conference registration and details',
    html:evnt({ac:'#1d4ed8',title:'{{conference_name}} — Registration Open',sub:'Secure your spot at the year\'s biggest event.',body:'Join thousands of professionals for {{conference_name}}. Three days of keynotes, workshops, and networking — all designed to accelerate your growth. Early-bird tickets are available for a limited time.',date:'{{conference_dates}}',time:'9:00 AM – 6:00 PM',loc:'{{venue_name}}, {{city}}',cta:'Register Now — Early Bird',speakers:['{{keynote_1}}','{{keynote_2}}','{{keynote_3}}']})},

  { id:'ev03', name:'Event Reminder', category:'event', accentColor:'#ea580c', description:'24-hour reminder before an event',
    html:evnt({ac:'#ea580c',title:'Reminder: {{event_name}} Is Tomorrow!',sub:'Make sure you\'re prepared.',body:'Just a friendly reminder that {{event_name}} is happening tomorrow. We\'re looking forward to seeing you there. Here are the key details to help you plan your day.',date:'Tomorrow — {{event_date}}',time:'{{event_time}} {{timezone}}',loc:'{{event_location}}',cta:'Add to Calendar'})},

  { id:'ev04', name:'Workshop Invite', category:'event', accentColor:'#059669', description:'Hands-on workshop invitation',
    html:evnt({ac:'#059669',title:'Hands-On Workshop: {{workshop_title}}',sub:'Learn by doing — limited spots.',body:'This isn\'t another lecture. Our workshops are small, interactive, and designed to give you skills you can use immediately. You\'ll walk away with a finished project and a clear next step.',date:'{{workshop_date}}',time:'{{workshop_time}}',loc:'{{workshop_format}}',cta:'Claim My Spot',speakers:['{{instructor_name}}']})},

  { id:'ev05', name:'Virtual Summit', category:'event', accentColor:'#1e3a5f', description:'Multi-day virtual summit announcement',
    html:evnt({ac:'#1e3a5f',title:'{{summit_name}} Virtual Summit',sub:'3 days. 30 speakers. 0 travel required.',body:'The {{summit_name}} Virtual Summit brings together the brightest minds in the industry for three days of high-impact content. All sessions are recorded and available to registered attendees for 30 days after the event.',date:'{{summit_dates}}',time:'Daily: 10:00 AM – 5:00 PM {{timezone}}',loc:'Virtual (All time zones welcome)',cta:'Register for Free',speakers:['{{speaker_1}}','{{speaker_2}}','{{speaker_3}}','{{speaker_4}}']})},

  { id:'ev06', name:'Product Demo Invite', category:'event', accentColor:'#4f46e5', description:'Live product demo session invitation',
    html:evnt({ac:'#4f46e5',title:'See {{product_name}} in Action — Live Demo',sub:'30 minutes that could change how you work.',body:'Join our product team for a live walkthrough of {{product_name}}. We\'ll show you the features that matter most, answer your questions in real time, and give attendees an exclusive offer.',date:'{{demo_date}}',time:'{{demo_time}} {{timezone}}',loc:'Zoom (link sent after registration)',cta:'Book My Demo Spot'})},

  { id:'ev07', name:'Live Q&A Session', category:'event', accentColor:'#dc2626', description:'Live Q&A session invite',
    html:evnt({ac:'#dc2626',title:'Ask Us Anything — Live Q&A',sub:'Your questions. Our best answers. Live.',body:'We\'re setting aside an hour to answer your questions — no scripted responses, no PR spin. Just honest, direct answers from our founding team. Submit your questions in advance or ask them live.',date:'{{qa_date}}',time:'{{qa_time}} {{timezone}}',loc:'YouTube Live / Zoom',cta:'Submit a Question & Join'})},

  { id:'ev08', name:'Networking Event', category:'event', accentColor:'#0d9488', description:'Professional networking event invite',
    html:evnt({ac:'#0d9488',title:'{{event_name}} — Networking Evening',sub:'Connect with the people who get it.',body:'Building meaningful connections matters. Join us for an evening designed around genuine conversation, shared interests, and the kind of introductions that actually lead somewhere.',date:'{{event_date}}',time:'{{event_time}} — {{end_time}}',loc:'{{venue_name}}, {{city}}',cta:'RSVP Now'})},

  { id:'ev09', name:'Event Recap', category:'event', accentColor:'#374151', description:'Post-event recap with highlights',
    html:newsletter({ac:'#374151',title:'{{event_name}} — Here\'s What You Missed',sub:'Key highlights and recordings from the event.',items:[{h:'The Biggest Takeaways',p:'Here are the top five insights from the event that our attendees said were most valuable.',link:'Read the recap'},{h:'Watch the Recordings',p:'All sessions have been recorded and are available to watch on demand for the next 30 days.',link:'Watch now'},{h:'What\'s Coming Next',p:'We\'re already planning our next event and we\'d love your input on what topics to cover.',link:'Share your ideas'}]})},

  { id:'ev10', name:'Thank You for Attending', category:'event', accentColor:'#d97706', description:'Post-event thank you and follow-up',
    html:banner({ac:'#d97706',title:'Thank You for Being There 🙏',sub:'It was a pleasure having you with us.',body:'Hi {{first_name}},<br><br>We\'re so grateful you joined us for {{event_name}}. Events like this are only possible because of people like you who show up, engage, and contribute to the conversation. We hope it was worth your time.',cta:'Watch the Recording',pre:'Thank you for attending — recording available now.'})},

  // ── SEASONAL (12) ───────────────────────────────────────────────────────────
  { id:'s01', name:'Christmas Sale', category:'seasonal', accentColor:'#b91c1c', description:'Christmas promotional email',
    html:banner({ac:'#b91c1c',badge:'🎄 Christmas Sale',title:'Merry Christmas & Big Savings',sub:'Spread joy this festive season.',body:'Hi {{first_name}},<br><br>The most wonderful time of the year is here — and so are our best prices. Whether you\'re shopping for loved ones or treating yourself, we\'ve got the perfect gifts at prices that won\'t leave you feeling the January pinch.',cta:'Shop Christmas Gifts',disc:'40% OFF',pre:'🎄 Merry Christmas — shop our festive sale!'})},

  { id:'s02', name:'New Year Wishes', category:'seasonal', accentColor:'#92400e', description:'New Year greetings and promotion',
    html:banner({ac:'#92400e',badge:'🥂 Happy New Year',title:'Here\'s to a Brilliant {{year}}',sub:'New year, new opportunities, new you.',body:'Hi {{first_name}},<br><br>We want to wish you a truly wonderful new year. As we close out {{last_year}} and step into {{year}}, we\'re committed to doing even more for you. To kick things off, here\'s a special deal just for the new year.',cta:'Start the Year with Savings',disc:'20% OFF',pre:'Happy New Year — celebrate with savings!'})},

  { id:'s03', name:"Valentine's Day", category:'seasonal', accentColor:'#be185d', description:"Valentine's Day promotion",
    html:banner({ac:'#be185d',badge:"💝 Valentine's Day",title:'Show Them You Care',sub:'The perfect gift for the people you love.',body:'Hi {{first_name}},<br><br>Valentine\'s Day is the perfect excuse to do something special for the people who matter most. We\'ve curated a collection of thoughtful gifts that are guaranteed to make someone smile.',cta:'Find the Perfect Gift',pre:"💝 Valentine's Day gifts — shop now."})},

  { id:'s04', name:'Easter Greetings', category:'seasonal', accentColor:'#16a34a', description:'Easter seasonal email with promo',
    html:banner({ac:'#16a34a',badge:'🐣 Happy Easter',title:'Wishing You a Joyful Easter',sub:'Celebrate the season with a special offer.',body:'Hi {{first_name}},<br><br>Easter is a time for new beginnings, joy, and being together. We hope you\'re enjoying the long weekend. And because we love celebrating with you, here\'s a little Easter surprise.',cta:'Claim Your Easter Treat',code:'EASTER15',pre:'Happy Easter — your seasonal gift is inside!'})},

  { id:'s05', name:"Mother's Day", category:'seasonal', accentColor:'#db2777', description:"Mother's Day gift campaign",
    html:banner({ac:'#db2777',badge:"💐 Mother's Day",title:'Celebrate the Amazing Mums in Your Life',sub:'Find the perfect way to say thank you.',body:'Hi {{first_name}},<br><br>Mother\'s Day is the one day of the year to go all out for the woman who has done everything for you. We\'ve put together a curated selection of gifts that go beyond the ordinary.',cta:'Find Her Perfect Gift',pre:"Mother's Day gifts — make it unforgettable."})},

  { id:'s06', name:"Father's Day", category:'seasonal', accentColor:'#1d4ed8', description:"Father's Day gift campaign",
    html:banner({ac:'#1d4ed8',badge:"👔 Father's Day",title:'For the Dad Who Deserves the Best',sub:'Thoughtful gifts for every kind of dad.',body:'Hi {{first_name}},<br><br>Finding the right gift for Dad can be tricky — but we\'ve done the hard work for you. Our Father\'s Day selection has something for every budget and every kind of dad.',cta:"Shop Father's Day Gifts",pre:"Father's Day is coming — shop our gift guide."})},

  { id:'s07', name:'Halloween Sale', category:'seasonal', accentColor:'#c2410c', description:'Halloween promotional campaign',
    html:banner({ac:'#c2410c',badge:'🎃 Halloween',title:'Scary Good Deals This Halloween',sub:'Treats without the tricks — guaranteed.',body:'Hi {{first_name}},<br><br>We couldn\'t let Halloween pass without some frighteningly good deals. Our spooky sale is live for 48 hours only — no tricks, just serious discounts on everything in our store.',cta:'Shop Halloween Deals',disc:'31% OFF',pre:'🎃 Boo! Halloween deals are here.'})},

  { id:'s08', name:'Thanksgiving', category:'seasonal', accentColor:'#b45309', description:'Thanksgiving gratitude email',
    html:banner({ac:'#b45309',badge:'🦃 Thanksgiving',title:'We\'re Grateful for You',sub:'Thank you for being part of our story.',body:'Hi {{first_name}},<br><br>Thanksgiving is a time to reflect on everything we\'re grateful for — and you\'re at the top of our list. Your loyalty, feedback, and support mean the world to us. As our thank-you, here\'s something special.',cta:'Claim Your Thank-You Gift',pre:'Happy Thanksgiving — we\'re grateful for you.'})},

  { id:'s09', name:'Summer Collection', category:'seasonal', accentColor:'#e11d48', description:'Summer new collection launch',
    html:product({ac:'#e11d48',badge:'☀️ Summer Collection',title:'The Summer Collection Is Here',tag:'Made for the season you\'ve been waiting for.',body:'Long days, warm evenings, and our best summer collection yet. We\'ve designed everything with the season in mind — bright, bold, and built to last through every adventure.',feats:['Lightweight and breathable materials','UV-resistant colours that won\'t fade','Perfect for travel and outdoor use','Sizes and options for everyone'],cta:'Shop Summer Collection'})},

  { id:'s10', name:'Spring Sale', category:'seasonal', accentColor:'#16a34a', description:'Spring season sale email',
    html:banner({ac:'#16a34a',badge:'🌸 Spring Sale',title:'Spring Is Here — And So Are Our Deals',sub:'Fresh season, fresh savings.',body:'Hi {{first_name}},<br><br>Spring is the season of new beginnings and we\'re celebrating with our freshest sale of the year. Everything is in bloom — including our discounts. Come explore what\'s new.',cta:'Shop the Spring Sale',op:'Was {{original_price}}',sp:'Now {{sale_price}}',pre:'Spring sale is live — fresh deals inside!'})},

  { id:'s11', name:'Winter Collection', category:'seasonal', accentColor:'#1e3a5f', description:'Winter collection launch email',
    html:product({ac:'#1e3a5f',badge:'❄️ Winter Collection',title:'The Winter Collection Has Arrived',tag:'Stay warm. Stay stylish.',body:'Cold days call for our warmest, most premium collection yet. Designed for the season and built for the long haul — every piece in our winter range is made to last and to look great doing it.',feats:['Premium winter-grade materials','Timeless designs that outlast trends','Free express delivery on all winter items','Easy returns within 60 days'],cta:'Shop Winter Collection'})},

  { id:'s12', name:'Back to School Season', category:'seasonal', accentColor:'#854d0e', description:'Back to school seasonal email',
    html:banner({ac:'#854d0e',badge:'📚 Back to School',title:'Ready for a Great New Year?',sub:'Everything you need, at prices you\'ll love.',body:'Hi {{first_name}},<br><br>The new school year is right around the corner. Whether you\'re a student gearing up for class or a parent stocking up, we\'ve got everything on the list — and it\'s all on sale.',cta:'Shop Back to School',code:'SCHOOL15',pre:'Back to school — 15% off essentials.'})},

  // ── SAAS (10) ───────────────────────────────────────────────────────────────
  { id:'saas01', name:'Trial Expiring Soon', category:'saas', accentColor:'#ea580c', description:'Trial expiry warning email',
    html:trans({ac:'#ea580c',icon:'⏳',title:'Your Trial Ends in {{days_remaining}} Days',sub:'Don\'t lose your progress.',body:'Hi {{first_name}}, your free trial of {{product_name}} is coming to an end. Everything you\'ve built, configured, and customised will be preserved — but only if you upgrade before the trial ends.',rows:[{l:'Trial Ends',v:'{{trial_end_date}}'},{l:'Days Remaining',v:'{{days_remaining}} days'},{l:'Current Usage',v:'{{usage_summary}}'},{l:'Data Preserved',v:'Yes — until you decide'}],cta:'Upgrade My Plan'})},

  { id:'saas02', name:'Feature Update Email', category:'saas', accentColor:'#2563eb', description:'Feature update announcement for users',
    html:twocol({ac:'#2563eb',title:'New Features Just Shipped 🚀',sub:'Here\'s everything that\'s new this sprint.',cta:'Explore New Features',cols:[{icon:'⚡',title:'Faster Performance',text:'Core operations are now up to 3x faster.'},{icon:'🎨',title:'UI Refresh',text:'Cleaner, more intuitive interface across all views.'},{icon:'🔗',title:'New API Endpoints',text:'More flexibility for your team\'s integrations.'},{icon:'📊',title:'Improved Reports',text:'Download, schedule, and share reports with ease.'}]})},

  { id:'saas03', name:'Onboarding Step 1', category:'saas', accentColor:'#4f46e5', description:'First onboarding email after signup',
    html:twocol({ac:'#4f46e5',title:'Step 1: Set Up Your Workspace',sub:'Let\'s get you up and running in 5 minutes.',cta:'Start Setup Now',cols:[{icon:'🏢',title:'Name Your Workspace',text:'Give your workspace a name that reflects your brand or team.'},{icon:'📧',title:'Invite Your Team',text:'Add team members so you can collaborate immediately.'},{icon:'🔌',title:'Connect Your Tools',text:'Link the apps you already use for seamless workflow.'},{icon:'🎯',title:'Set Your First Goal',text:'Define what success looks like so we can help you get there.'}]})},

  { id:'saas04', name:'Onboarding Step 2', category:'saas', accentColor:'#7c3aed', description:'Second onboarding email with advanced setup',
    html:product({ac:'#7c3aed',title:'Step 2: You\'re Ready for the Good Stuff',tag:'Advanced features, made simple.',body:'You\'ve completed the basics — now it\'s time to unlock the power features that will really accelerate your workflow. Each of these takes less than two minutes to set up.',feats:['Enable automated workflows and save hours weekly','Set up your first dashboard for real-time insights','Configure notifications to stay on top of what matters','Explore the template library to get started faster'],cta:'Continue My Setup'})},

  { id:'saas05', name:'Monthly Usage Report', category:'saas', accentColor:'#0d9488', description:'Monthly product usage summary',
    html:trans({ac:'#0d9488',icon:'📊',title:'Your Monthly Usage Report',sub:'Here\'s how you used {{product_name}} in {{month}}.',body:'Hi {{first_name}}, here\'s a summary of your activity this month. Understanding your usage helps you get more from the platform.',rows:[{l:'Active Days',v:'{{active_days}}/{{total_days}}'},{l:'Tasks Completed',v:'{{tasks_completed}}'},{l:'Team Members Active',v:'{{active_users}}'},{l:'Most Used Feature',v:'{{top_feature}}'},{l:'Time Saved (est.)',v:'{{time_saved}} hours'}],cta:'View Full Report'})},

  { id:'saas06', name:'Billing Reminder', category:'saas', accentColor:'#d97706', description:'Upcoming billing reminder',
    html:trans({ac:'#d97706',icon:'💳',title:'Upcoming Payment Reminder',sub:'Your plan renews in {{days_until_renewal}} days.',body:'Hi {{first_name}}, this is a friendly reminder that your {{plan_name}} subscription will renew automatically in {{days_until_renewal}} days. No action is needed unless you\'d like to update your payment method.',rows:[{l:'Plan',v:'{{plan_name}}'},{l:'Amount',v:'{{currency}}{{amount}}'},{l:'Renewal Date',v:'{{renewal_date}}'},{l:'Payment Method',v:'•••• {{last4}}'}],cta:'Review Billing Settings'})},

  { id:'saas07', name:'Password Reset', category:'saas', accentColor:'#374151', description:'Password reset request email',
    html:minimal({from:'Security — {{company_name}}',ac:'#374151',title:'Reset Your Password',body:'<p>Hi {{first_name}},</p><p>We received a request to reset the password for your account. Click the button below to set a new password. This link will expire in 1 hour.</p><p>If you didn\'t request a password reset, you can safely ignore this email — your account is secure.</p>',cta:'Reset My Password'})},

  { id:'saas08', name:'Security Alert', category:'saas', accentColor:'#dc2626', description:'Security notification for unusual activity',
    html:trans({ac:'#dc2626',icon:'🔐',title:'Security Alert: New Sign-In Detected',sub:'Was this you? Please verify.',body:'Hi {{first_name}}, we detected a new sign-in to your account from an unrecognised device or location. If this was you, no action is needed. If not, please secure your account immediately.',rows:[{l:'Date & Time',v:'{{signin_datetime}}'},{l:'Device',v:'{{device_type}}'},{l:'Location',v:'{{signin_location}}'},{l:'IP Address',v:'{{ip_address}}'}],cta:'Secure My Account'})},

  { id:'saas09', name:'Plan Upgrade Prompt', category:'saas', accentColor:'#4338ca', description:'Prompt to upgrade to a higher plan',
    html:product({ac:'#4338ca',badge:'Upgrade Available',title:'You\'re Ready for {{next_plan}}',tag:'You\'ve outgrown your current plan.',body:'Based on your usage, you\'d benefit significantly from upgrading to {{next_plan}}. You\'re consistently hitting your limits — and with an upgrade, those limits disappear.',feats:['Unlimited {{resource_1}}','Priority support with {{response_time}} response time','Advanced {{feature_name}} with more customisation','Team collaboration for up to {{seat_count}} users'],cta:'Upgrade to {{next_plan}}'})},

  { id:'saas10', name:'Cancellation Confirmed', category:'saas', accentColor:'#374151', description:'Subscription cancellation confirmation',
    html:trans({ac:'#374151',icon:'😢',title:'Your Subscription Has Been Cancelled',sub:'We\'re sorry to see you go.',body:'Hi {{first_name}}, your {{plan_name}} subscription has been successfully cancelled. You\'ll continue to have access until the end of your current billing period. All your data is preserved for 30 days.',rows:[{l:'Plan Cancelled',v:'{{plan_name}}'},{l:'Access Until',v:'{{access_end_date}}'},{l:'Data Preserved Until',v:'{{data_deletion_date}}'},{l:'Refund',v:'{{refund_status}}'}],cta:'Reactivate My Account'})},

  // ── B2B (8) ─────────────────────────────────────────────────────────────────
  { id:'b2b01', name:'Partnership Proposal', category:'b2b', accentColor:'#1e3a5f', description:'Partnership or collaboration outreach',
    html:minimal({from:'Business Development — {{company_name}}',ac:'#1e3a5f',title:'A Partnership Opportunity Worth Exploring',body:'<p>Hi {{first_name}},</p><p>I\'m reaching out because I believe there\'s a genuine opportunity for {{company_name}} and {{their_company}} to create something valuable together.</p><p>Our customers and yours share the same challenges, and a partnership could help both sides deliver a better solution. I\'d love to schedule a 20-minute call to explore what that could look like.</p><p>Would you be open to a conversation this week or next?</p>',cta:'Book a 20-Minute Call'})},

  { id:'b2b02', name:'Meeting Request', category:'b2b', accentColor:'#1d4ed8', description:'Professional meeting request email',
    html:minimal({from:'{{sender_name}} — {{company_name}}',ac:'#1d4ed8',title:'I\'d Love 20 Minutes of Your Time',body:'<p>Hi {{first_name}},</p><p>I\'ve been following {{their_company}}\'s work and I\'m genuinely impressed by what your team is building. I believe we can help you {{value_proposition}} — and I\'d love to show you exactly how.</p><p>Would you be available for a brief call this week? I\'ll come prepared with specific ideas relevant to your business.</p>',cta:'Pick a Time That Works'})},

  { id:'b2b03', name:'Quarterly Report', category:'b2b', accentColor:'#374151', description:'Quarterly business review email',
    html:trans({ac:'#374151',icon:'📋',title:'Q{{quarter}} {{year}} — Business Review',sub:'Your performance summary and insights.',body:'Hi {{first_name}}, please find below your quarterly summary. This report covers the key metrics and outcomes from the past three months.',rows:[{l:'Period',v:'Q{{quarter}} {{year}}'},{l:'Total Revenue',v:'{{currency}}{{revenue}}'},{l:'Growth vs Last Quarter',v:'+{{growth_pct}}%'},{l:'Active Accounts',v:'{{account_count}}'},{l:'Customer Satisfaction',v:'{{csat_score}}/10'}],cta:'View Full Report'})},

  { id:'b2b04', name:'Invoice Ready', category:'b2b', accentColor:'#059669', description:'Invoice notification email',
    html:trans({ac:'#059669',icon:'🧾',title:'Invoice #{{invoice_number}} Is Ready',sub:'Payment due by {{due_date}}.',body:'Hi {{first_name}}, please find below the details for your latest invoice. You can pay online via our secure portal or by bank transfer using the details in the attached PDF.',rows:[{l:'Invoice Number',v:'#{{invoice_number}}'},{l:'Invoice Date',v:'{{invoice_date}}'},{l:'Due Date',v:'{{due_date}}'},{l:'Amount Due',v:'{{currency}}{{invoice_amount}}'},{l:'Payment Method',v:'Online / Bank Transfer'}],cta:'Pay Invoice Online'})},

  { id:'b2b05', name:'Contract Renewal', category:'b2b', accentColor:'#6d28d9', description:'Contract renewal reminder',
    html:banner({ac:'#6d28d9',badge:'Action Required',title:'Your Contract Comes Up for Renewal',sub:'Let\'s make sure everything is in order.',body:'Hi {{first_name}},<br><br>Your current agreement with {{company_name}} is due to expire on {{contract_end_date}}. We\'d love to continue working together and have put together a renewal proposal that reflects the value we\'ve delivered.',cta:'Review Renewal Proposal',pre:'Your contract renewal is due — review now.'})},

  { id:'b2b06', name:'Case Study Showcase', category:'b2b', accentColor:'#4338ca', description:'Share a relevant case study with a prospect',
    html:product({ac:'#4338ca',title:'How {{client_name}} Achieved {{result}}',tag:'A case study we thought you\'d find relevant.',body:'We recently helped {{client_name}} — a company with a very similar profile to yours — achieve {{result}} in just {{timeframe}}. Here\'s a breakdown of how we did it.',feats:['Challenge: {{client_challenge}}','Solution: {{solution_summary}}','Result: {{result}} in {{timeframe}}','ROI: {{roi_figure}} return on investment'],cta:'Read the Full Case Study'})},

  { id:'b2b07', name:'White Paper Download', category:'b2b', accentColor:'#0d9488', description:'Deliver a gated white paper or report',
    html:banner({ac:'#0d9488',badge:'📄 Free Download',title:'Your White Paper Is Ready',sub:'{{whitepaper_title}}',body:'Hi {{first_name}},<br><br>Thank you for downloading our white paper. Inside you\'ll find {{page_count}} pages of original research, analysis, and recommendations that you can put to work immediately. We hope it adds real value to your planning.',cta:'Download White Paper',pre:'Your requested white paper is ready to download.'})},

  { id:'b2b08', name:'Demo Request Confirmed', category:'b2b', accentColor:'#ea580c', description:'Confirm a product demo request',
    html:trans({ac:'#ea580c',icon:'🎯',title:'Your Demo Is Confirmed!',sub:'We\'re looking forward to showing you {{product_name}}.',body:'Hi {{first_name}}, your personalised demo of {{product_name}} is booked. Our team will take you through the features most relevant to your use case and answer any questions you have.',rows:[{l:'Date & Time',v:'{{demo_datetime}}'},{l:'Duration',v:'30–45 minutes'},{l:'Format',v:'Video call (Zoom / Google Meet)'},{l:'Your Host',v:'{{host_name}}'},{l:'Confirmation Sent To',v:'{{email}}'}],cta:'Add to My Calendar'})},
]
