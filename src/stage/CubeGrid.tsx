import type { ObjectState } from '../engine/state'
import { CellGroup } from './CellGroup'

/** CubeGrid：外表面的面显示为红色（涂色面），其余面米白 */
export function CubeGrid({ obj }: { obj: ObjectState }) {
  return <CellGroup obj={obj} painted />
}
