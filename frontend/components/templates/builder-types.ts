export type BlockType = 'header' | 'text' | 'image' | 'button'
export type Alignment = 'left' | 'center' | 'right'

export interface HeaderData {
  title: string
  subtitle: string
  backgroundColor: string
  textColor: string
}

export interface TextData {
  content: string
  fontSize: number
  color: string
  textAlign: Alignment
}

export interface ImageData {
  src: string
  alt: string
  link: string
  width: string
  alignment: Alignment
}

export interface ButtonData {
  text: string
  link: string
  backgroundColor: string
  textColor: string
  borderRadius: number
  alignment: Alignment
}

export type BlockData = HeaderData | TextData | ImageData | ButtonData

export interface Block {
  id: string
  type: BlockType
  data: BlockData
}

const DEFAULTS: Record<BlockType, BlockData> = {
  header: {
    title: 'Your Headline Here',
    subtitle: 'Short subtitle or tagline',
    backgroundColor: '#3b82f6',
    textColor: '#ffffff',
  } as HeaderData,
  text: {
    content: 'Hi {{first_name}}, add your email content here. This is a paragraph you can fully customize.',
    fontSize: 16,
    color: '#333333',
    textAlign: 'left',
  } as TextData,
  image: {
    src: '',
    alt: 'Email image',
    link: '',
    width: '100%',
    alignment: 'center',
  } as ImageData,
  button: {
    text: 'Click Here',
    link: '#',
    backgroundColor: '#3b82f6',
    textColor: '#ffffff',
    borderRadius: 6,
    alignment: 'center',
  } as ButtonData,
}

export function createBlock(type: BlockType): Block {
  return {
    id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    data: { ...DEFAULTS[type] },
  }
}

export const INITIAL_BLOCKS: Block[] = [
  { id: 'init-header', type: 'header', data: { ...DEFAULTS.header } },
  { id: 'init-text', type: 'text', data: { ...DEFAULTS.text } },
  { id: 'init-button', type: 'button', data: { ...DEFAULTS.button } },
]

const MARKER = 'email-builder-v1'

function safeDecode(str: string): string {
  return decodeURIComponent(atob(str))
}

function safeEncode(str: string): string {
  return btoa(encodeURIComponent(str))
}

export function parseBuilderBlocks(html: string): Block[] | null {
  const match = html.match(new RegExp(`<!--${MARKER}:([A-Za-z0-9+/=%-]+):${MARKER}-->`))
  if (!match) return null
  try {
    return JSON.parse(safeDecode(match[1])) as Block[]
  } catch {
    return null
  }
}

export function serializeBlocksIntoHtml(html: string, blocks: Block[]): string {
  const stripped = html.replace(new RegExp(`<!--${MARKER}:[A-Za-z0-9+/=%-]+:${MARKER}-->`), '')
  return `${stripped.trimEnd()}\n<!--${MARKER}:${safeEncode(JSON.stringify(blocks))}:${MARKER}-->`
}
