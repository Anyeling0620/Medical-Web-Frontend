import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/nursing/caregiver/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/nursing/caregiver/"!</div>
}
