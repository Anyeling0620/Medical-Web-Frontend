import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/nursing/doctor/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/nursing/doctor/"!</div>
}
