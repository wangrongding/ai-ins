import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)

  return (
    <div className="counter">
      <p>React 岛屿：点了 {count} 次</p>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        +1
      </button>
    </div>
  )
}
