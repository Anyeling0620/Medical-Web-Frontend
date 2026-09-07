import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/nursing/consultation-fee/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/nursing/consultation-fee/"!</div>
}
