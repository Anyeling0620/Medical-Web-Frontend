import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/nursing/nurse/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/nursing/nurse/"!</div>
}
