// 「访客登录」使用的账号凭据。
//
// 访客不是新增接口，也不是虚拟主体，而是数据库 hospital.mis_user 里的真实账号：
// 账号 guest 绑定「访客」角色，该角色只被授予 SELECT 权限
// （全部 `模块:SELECT`，排除 PATIENT_USER:SELECT 与 MEDICAL_RECORD:SELECT），
// 因此访客登录后能查询科室、医生、出诊排班等数据，但任何写操作都会被后端 403 拒绝。
// 开户脚本见 Medical-Web-Backend/scripts/seed_guest_account.sql。
//
// 注意：这两个值会打进前端产物，属于公开凭据，只允许用于只读浏览账号。
// 修改密码时必须同时修改数据库与这里，并重新构建前端。
export const GUEST_USERNAME = "guest";
export const GUEST_PASSWORD = "Guest@2026";

// 登录页访客入口下方的一行说明：只交代能力边界，不展开描述。
export const GUEST_ACCOUNT_NOTICE = "访客账号只能查询数据，不能新增、修改或删除。";
