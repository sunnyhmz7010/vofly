设备详情页的 eSIM 标签页管理 eUICC 芯片与 Profile：
- 下载：通过 LPA 流程从运营商 SMDP/SMDS 服务器下载 Profile，下载地址支持二维码或手输激活码。
- 切换：切换目标 Profile 时会短暂进入飞行模式并在完成后自动恢复网络；被切换出去的 Profile 保持已安装状态。
- 删除：删除前请确认该 Profile 不再需要，删除操作不可恢复。

系统用 ICCID + eUICC 的 ISD-R AID（芯片级标识）唯一区分同一 ICCID 下载在多颗芯片上的 Profile；自动任务与余额查询按同样的键定位目标卡。设备当前激活卡未出现在 eSIM 清单中时（实体 SIM 设备），按实体卡处理。
