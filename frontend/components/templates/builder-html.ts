import { Block, HeaderData, TextData, ImageData, ButtonData } from './builder-types'

function renderBlock(block: Block): string {
  switch (block.type) {
    case 'header': {
      const d = block.data as HeaderData
      return [
        `<div style="background-color:${d.backgroundColor};padding:40px 30px;text-align:center;">`,
        `<h1 style="margin:0;color:${d.textColor};font-size:28px;font-family:Arial,sans-serif;line-height:1.3;">${d.title}</h1>`,
        d.subtitle ? `<p style="margin:10px 0 0;color:${d.textColor};font-size:16px;font-family:Arial,sans-serif;opacity:0.85;">${d.subtitle}</p>` : '',
        `</div>`,
      ].filter(Boolean).join('\n')
    }
    case 'text': {
      const d = block.data as TextData
      return [
        `<div style="padding:20px 30px;">`,
        `<p style="margin:0;color:${d.color};font-size:${d.fontSize}px;font-family:Arial,sans-serif;text-align:${d.textAlign};line-height:1.6;">${d.content}</p>`,
        `</div>`,
      ].join('\n')
    }
    case 'image': {
      const d = block.data as ImageData
      if (!d.src) {
        return `<div style="padding:20px 30px;text-align:center;"><div style="background:#f0f0f0;height:100px;border:2px dashed #ccc;color:#999;font-family:Arial,sans-serif;font-size:14px;display:flex;align-items:center;justify-content:center;">Image placeholder</div></div>`
      }
      const margin =
        d.alignment === 'center' ? 'margin:0 auto;' :
        d.alignment === 'right' ? 'margin-left:auto;' : ''
      const img = `<img src="${d.src}" alt="${d.alt}" style="max-width:100%;width:${d.width};display:block;${margin}" />`
      return [
        `<div style="padding:20px 30px;">`,
        d.link ? `<a href="${d.link}" style="display:block;">${img}</a>` : img,
        `</div>`,
      ].join('\n')
    }
    case 'button': {
      const d = block.data as ButtonData
      return [
        `<div style="padding:20px 30px;text-align:${d.alignment};">`,
        `<a href="${d.link}" style="display:inline-block;background-color:${d.backgroundColor};color:${d.textColor};padding:14px 28px;text-decoration:none;border-radius:${d.borderRadius}px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${d.text}</a>`,
        `</div>`,
      ].join('\n')
    }
  }
}

export function generateHtml(blocks: Block[]): string {
  const body = blocks.map(renderBlock).join('\n')
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;">
<tr><td align="center" style="padding:20px 0;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td>
${body}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
