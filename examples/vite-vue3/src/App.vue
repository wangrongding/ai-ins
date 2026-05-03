<template>
  <main class="hero">
    <span class="badge">AI Ins</span>
    <h1 class="title">按住 Option / Alt 点一下页面，AI 帮你改代码</h1>
    <p class="desc">看到页面上哪里想改？直接点它。AI Ins 会自动找到对应的源码，告诉 AI 该改哪里。</p>
    <p class="desc">不用翻文件、不用找代码——说一句你想怎么改，AI 直接帮你搞定。</p>
    <button class="btn" type="button">试一试</button>
  </main>
</template>

<style scoped>
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 3rem 2rem;
  background:
    radial-gradient(ellipse 80% 60% at 50% 0%, #0ea5e920 0%, transparent 70%),
    linear-gradient(160deg, #0f172a 0%, #1e293b 40%, #0f172a 100%);
  color: #e0e0e0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  text-align: center;
  overflow: hidden;
}

.badge {
  display: inline-block;
  padding: 0.4em 1.2em;
  margin-bottom: 2rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #c4b5fd;
  border: 1px solid #a78bfa33;
  border-radius: 999px;
  background: linear-gradient(135deg, #a78bfa18, #7c3aed10);
  backdrop-filter: blur(8px);
  animation: fadeDown 0.6s ease-out both;
}

.title {
  max-width: 740px;
  margin: 0 0 1.5rem;
  font-size: clamp(1.8rem, 4.5vw, 2.8rem);
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: -0.02em;
  background: linear-gradient(135deg, #fff 30%, #c4b5fd 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: fadeDown 0.6s 0.15s ease-out both;
}

.desc {
  max-width: 580px;
  margin: 0 0 0.6rem;
  font-size: 1.05rem;
  line-height: 1.8;
  color: #9ca3bf;
  animation: fadeDown 0.6s 0.3s ease-out both;
}

.desc + .desc {
  margin-bottom: 0;
}

.btn {
  margin-top: 2.5rem;
  padding: 0.85em 2.4em;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: #fff;
  background: linear-gradient(135deg, #8b5cf6, #6d28d9);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow:
    0 4px 16px #7c3aed44,
    0 0 0 0 #7c3aed00;
  animation: fadeDown 0.6s 0.45s ease-out both;
}

.btn:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow:
    0 8px 24px #7c3aed66,
    0 0 0 3px #7c3aed22;
}

.btn:active {
  transform: translateY(0) scale(0.98);
  transition-duration: 0.08s;
}

@keyframes fadeDown {
  from {
    opacity: 0;
    transform: translateY(-12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>