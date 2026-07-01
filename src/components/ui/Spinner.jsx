export default function Spinner({ size = 20 }) {
  return (
    <div
      className="border-2 border-gold border-t-transparent rounded-full animate-spin inline-block"
      style={{ width: size, height: size }}
    />
  )
}
