import { ajax } from '../lib/api'

export type DoctorOrder = 'ASC' | 'DESC'

export interface DoctorSearchParams {
  name?: string
  deptId?: number
  degree?: string
  job?: string
  recommended?: boolean
  status: number
  order?: DoctorOrder
  page: number
  length: number
}

export interface Doctor {
  id: number
  name: string
  sex: string
  tel: string
  school: string
  degree: string
  job: string
  deptName: string
  subName: string
  recommended: boolean
  status: number
}

export function getDoctorsList({
                                 page = 1,
                                 length = 10,
                                 ...filters
                               }: DoctorSearchParams) {
  return ajax<Doctor[]>({
    url: '/doctor/search',
    method: 'GET',
    data: {
      ...filters,
      page,
      length,
    },
  })
}