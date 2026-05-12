const highlights = ['Next.js App Router', 'Turbopack dev server', 'AI Ins source markers']

export default function Page() {
  return (
    <main>
      <section className='hero'>
        <p className='eyebrow'>AI Ins for Next.js</p>
        <h1>
          Option / Alt 点选 <span>Next.js DOM</span>
        </h1>
        <p className='lede'>这个示例使用 Next.js + Turbopack，验证 AI Ins 客户端注入、middleware 转发和 JSX source 标记。</p>
        <div className='toolbar'>
          {highlights.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>
    </main>
  )
}
