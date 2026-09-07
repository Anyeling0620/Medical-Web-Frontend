import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/nursing/consultation-fee/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/nursing/consultation-fee/"!</div>
}
