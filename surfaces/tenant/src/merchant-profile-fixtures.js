// One source for the merchant prototype baseline; both configuration and bot binding use the same tenant objects.
(() => {
    const merchantProfileFixtures = [
      {
        id: "MCH-2031",
        name: "星河游戏",
        type: "主商户",
        owner: "陈凯",
        phone: "+63 912 880 2031",
        capabilities: ["法币代收", "法币代付"],
        status: "正常",
        ingress: "开启",
        cnyAvailable: 1645630.50,
        cnyFrozen: 69120.00,
        ipStatus: "已确认",
        successRate: 94.2,
        todayAmount: "CNY 2,418,320.20",
        volume: {
          collect: { amount: "CNY 1,680,240.20", rate: "96.2%", count: 826, product: "银行卡转账 / CNY-快捷支付" },
          payout: { amount: "CNY 738,080.00", rate: "92.8%", count: 214, product: "银行卡代付 / CNY-快捷支付" }
        },
        collectConfig: {
          status: "开启",
          today: "CNY 1,680,240.20",
          cnyBalance: "937,640.50",
          cnyPrepay: "12,300.00",
          cnyRemain: "925,340.50",
          products: [
            ["银行卡转账", "CNY", "0.62%", "CNY 1.00", "单笔 50,000 / 日 2,000,000"],
            ["CNY-快捷支付", "CNY", "0.38%", "CNY 0.20", "单笔 20,000 / 日 100,000"]
          ],
          orderApi: "https://gateway.huisheng.example/collect/create",
          queryApi: "https://gateway.huisheng.example/collect/query",
          doc: "ShowDoc / 代收 API",
          callbackIp: "103.88.21.14, 103.88.21.15"
        },
        payoutConfig: {
          status: "开启",
          manualOrder: "开启",
          rejectNotice: "开启",
          singleFee: "CNY 2.00",
          cnyFrozenLimit: "36,820.00",
          cnyLimit: "608,210.00",
          cnyRemainPrepay: "571,390.00",
          cnyTotalPrepay: "608,210.00",
          channels: ["CBPay-CNY-01", "快捷支付-Payout-A"],
          fees: [
            ["银行卡代付", "CNY", "0.18%", "CNY 2.00", "日限 CNY 1,500,000"],
            ["快捷支付 代付", "CNY", "CNY 2.00", "CNY 2.00", "日限 CNY 80,000"]
          ],
          orderApi: "https://gateway.huisheng.example/payout/create",
          queryApi: "https://gateway.huisheng.example/payout/query",
          doc: "ShowDoc / 代付 API",
          orderIp: "103.88.21.14, 103.88.21.15"
        },
        created: "2026-06-12 10:24",
        callback: "https://api.stargame.example/pay/notify",
        whitelist: "103.88.21.14, 103.88.21.15",
        wallets: [
          ["CNY", "提款钱包", "168,900.00", "20,000.00", "148,900.00"],
          ["CNY", "代收钱包", "937,640.50", "12,300.00", "925,340.50"],
          ["CNY", "代付钱包", "608,210.00", "36,820.00", "571,390.00"]
        ],
        logs: [
          ["2026-07-05 13:42", "通知失败", "系统", "订单结果通知重试 3 次失败"],
          ["2026-07-04 19:06", "保存基础资料", "Jeff", "更新联系人和联系电话"],
          ["2026-07-04 18:10", "修改白名单", "Jeff", "新增 103.88.21.15"],
          ["2026-07-03 09:28", "启用业务", "Alice", "开通法币代收"]
        ]
      },
      {
        id: "MCH-1188",
        name: "东盛电商",
        type: "独立商户",
        owner: "李敏",
        phone: "+886 935 118 800",
        capabilities: ["法币代收", "法币代付"],
        status: "正常",
        ingress: "限额中",
        cnyAvailable: 886420.00,
        cnyFrozen: 72400.00,
        ipStatus: "已确认",
        successRate: 91.7,
        todayAmount: "CNY 1,112,040.00",
        volume: {
          collect: { amount: "CNY 652,040.00", rate: "93.4%", count: 304, product: "扫码收款 / 银行卡转账" },
          payout: { amount: "CNY 460,000.00", rate: "90.1%", count: 88, product: "银行卡代付 / CNY-快捷支付" }
        },
        collectConfig: {
          status: "开启",
          today: "CNY 652,040.00",
          cnyBalance: "760,200.00",
          cnyPrepay: "22,000.00",
          cnyRemain: "738,200.00",
          products: [
            ["扫码收款", "CNY", "0.62%", "CNY 1.00", "单笔 60,000 / 日 2,400,000"],
            ["银行卡转账", "CNY", "0.58%", "CNY 1.00", "单笔 120,000 / 日 3,000,000"]
          ],
          orderApi: "https://gateway.huisheng.example/collect/create",
          queryApi: "https://gateway.huisheng.example/collect/query",
          doc: "ShowDoc / 代收 API",
          callbackIp: "45.61.20.41"
        },
        payoutConfig: {
          status: "开启",
          manualOrder: "开启",
          rejectNotice: "关闭",
          singleFee: "CNY 2.00",
          cnyFrozenLimit: "50,400.00",
          cnyLimit: "126,220.00",
          cnyRemainPrepay: "75,820.00",
          cnyTotalPrepay: "126,220.00",
          channels: ["CBPay-CNY-03", "快捷支付-Payout-B"],
          fees: [
            ["银行卡代付", "CNY", "0.18%", "CNY 2.00", "日限 CNY 3,000,000"],
            ["快捷支付 代付", "CNY", "CNY 2.00", "CNY 2.00", "日限 CNY 120,000"]
          ],
          orderApi: "https://gateway.huisheng.example/payout/create",
          queryApi: "https://gateway.huisheng.example/payout/query",
          doc: "ShowDoc / 代付 API",
          orderIp: "45.61.20.41"
        },
        created: "2026-05-29 16:02",
        callback: "https://gateway.dongsheng.example/hs/callback",
        whitelist: "45.61.20.41",
        wallets: [
          ["CNY", "提款钱包", "886,420.00", "72,400.00", "814,020.00"],
          ["CNY", "代收钱包", "760,200.00", "22,000.00", "738,200.00"],
          ["CNY", "代付钱包", "126,220.00", "50,400.00", "75,820.00"]
        ],
        logs: [
          ["2026-07-06 09:22", "保存基础资料", "Jeff", "更新商户名称和联系电话"],
          ["2026-07-05 14:04", "通知成功", "系统", "代付结果通知成功"],
          ["2026-07-02 11:34", "密钥标记", "系统", "密钥 90 天未轮换"]
        ]
      },
      {
        id: "MCH-2209",
        name: "北辰游戏",
        type: "独立商户",
        owner: "王启",
        phone: "+63 998 120 2209",
        capabilities: ["法币代付"],
        status: "冻结",
        ingress: "暂停",
        cnyAvailable: 12340.00,
        cnyFrozen: 12600.00,
        ipStatus: "待确认",
        successRate: 87.4,
        todayAmount: "CNY 384,920.00",
        volume: {
          collect: { amount: "CNY 0.00", rate: "-", count: 0, product: "未开通" },
          payout: { amount: "CNY 384,920.00", rate: "87.4%", count: 41, product: "银行卡代付 / CNY-快捷支付" }
        },
        collectConfig: {
          status: "未开通",
          today: "CNY 0.00",
          cnyBalance: "0.00",
          cnyPrepay: "0.00",
          cnyRemain: "0.00",
          products: [],
          orderApi: "未开通",
          queryApi: "未开通",
          doc: "未开通",
          callbackIp: "未开通"
        },
        payoutConfig: {
          status: "暂停",
          manualOrder: "关闭",
          rejectNotice: "开启",
          singleFee: "CNY 2.00",
          cnyFrozenLimit: "12,600.00",
          cnyLimit: "24,940.00",
          cnyRemainPrepay: "12,340.00",
          cnyTotalPrepay: "24,940.00",
          channels: ["快捷支付-Payout-B"],
          fees: [
            ["快捷支付 代付", "CNY", "CNY 2.00", "CNY 2.00", "日限 CNY 30,000"]
          ],
          orderApi: "https://gateway.huisheng.example/payout/create",
          queryApi: "https://gateway.huisheng.example/payout/query",
          doc: "ShowDoc / 代付 API",
          orderIp: "待确认"
        },
        created: "2026-04-08 09:14",
        callback: "https://beichen.example/payout/notify",
        whitelist: "待补充",
        wallets: [
          ["CNY", "提款钱包", "24,940.00", "12,600.00", "12,340.00"],
          ["CNY", "代收钱包", "0.00", "0.00", "0.00"],
          ["CNY", "代付钱包", "24,940.00", "12,600.00", "12,340.00"]
        ],
        logs: [
          ["2026-07-05 12:18", "通知重试", "系统", "回调地址响应超时"],
          ["2026-07-05 10:22", "冻结商户", "风控", "IP 白名单待确认"],
          ["2026-07-04 21:09", "暂停进单", "运营", "运营阈值触发"]
        ]
      },
      {
        id: "MCH-3110",
        name: "澜海商服",
        type: "独立商户",
        owner: "许然",
        phone: "+60 17 331 1002",
        capabilities: ["法币代收"],
        status: "待配置",
        ingress: "暂停",
        cnyAvailable: 0,
        cnyFrozen: 0,
        ipStatus: "待确认",
        successRate: 0,
        todayAmount: "CNY 0.00",
        volume: {
          collect: { amount: "CNY 0.00", rate: "-", count: 0, product: "待配置" },
          payout: { amount: "CNY 0.00", rate: "-", count: 0, product: "未开通" }
        },
        collectConfig: {
          status: "待配置",
          today: "CNY 0.00",
          cnyBalance: "0.00",
          cnyPrepay: "0.00",
          cnyRemain: "0.00",
          products: [],
          orderApi: "待配置",
          queryApi: "待配置",
          doc: "待配置",
          callbackIp: "待配置"
        },
        payoutConfig: {
          status: "未开通",
          manualOrder: "关闭",
          rejectNotice: "关闭",
          singleFee: "-",
          cnyFrozenLimit: "0.00",
          cnyLimit: "0.00",
          cnyRemainPrepay: "0.00",
          cnyTotalPrepay: "0.00",
          channels: [],
          fees: [],
          orderApi: "未开通",
          queryApi: "未开通",
          doc: "未开通",
          orderIp: "未开通"
        },
        created: "2026-07-05 09:38",
        callback: "待配置",
        whitelist: "待配置",
        wallets: [
          ["CNY", "提款钱包", "0.00", "0.00", "0.00"],
          ["CNY", "代收钱包", "0.00", "0.00", "0.00"],
          ["CNY", "代付钱包", "0.00", "0.00", "0.00"]
        ],
        logs: [
          ["2026-07-05 09:38", "创建商户", "Jeff", "待补充 IP 白名单和回调地址"]
        ]
      },
      {
        id: "MCH-4116",
        name: "百胜聚合",
        type: "子商户",
        parentMerchantId: "MCH-2031",
        owner: "周盛",
        phone: "+63 917 411 6000",
        capabilities: ["法币代收"],
        status: "正常",
        ingress: "开启",
        cnyAvailable: 220140.10,
        cnyFrozen: 5120.00,
        ipStatus: "已确认",
        successRate: 96.5,
        todayAmount: "CNY 612,882.00",
        volume: {
          collect: { amount: "CNY 612,882.00", rate: "96.5%", count: 188, product: "CNY 代收 / 法币代收" },
          payout: { amount: "CNY 0.00", rate: "-", count: 0, product: "未开通" }
        },
        collectConfig: {
          status: "开启",
          today: "CNY 612,882.00",
          cnyBalance: "220,140.10",
          cnyPrepay: "5,120.00",
          cnyRemain: "215,020.10",
          products: [
            ["CNY 代收", "CNY", "0.60%", "CNY 1.00", "单笔 30,000 / 日 800,000"],
            ["扫码收款", "CNY", "0.62%", "CNY 1.00", "单笔 20,000 / 日 800,000"]
          ],
          orderApi: "https://gateway.huisheng.example/collect/create",
          queryApi: "https://gateway.huisheng.example/collect/query",
          doc: "ShowDoc / 代收 API",
          callbackIp: "103.88.21.14"
        },
        payoutConfig: {
          status: "未开通",
          manualOrder: "关闭",
          rejectNotice: "关闭",
          singleFee: "-",
          cnyFrozenLimit: "0.00",
          cnyLimit: "0.00",
          cnyRemainPrepay: "0.00",
          cnyTotalPrepay: "0.00",
          channels: [],
          fees: [],
          orderApi: "未开通",
          queryApi: "未开通",
          doc: "未开通",
          orderIp: "未开通"
        },
        created: "2026-06-30 15:17",
        callback: "https://baisheng.example/notify",
        whitelist: "103.88.21.14",
        wallets: [
          ["CNY", "提款钱包", "220,140.10", "5,120.00", "215,020.10"],
          ["CNY", "代收钱包", "220,140.10", "5,120.00", "215,020.10"],
          ["CNY", "代付钱包", "0.00", "0.00", "0.00"]
        ],
        logs: [
          ["2026-07-05 13:58", "通知成功", "系统", "代收订单回调成功"],
          ["2026-06-30 15:17", "创建商户", "Alice", "首版按独立商户创建"]
        ]
      }
    ];
    window.HSMerchantProfiles = {forTenant(id) {
      const data=window.HSProviderDemo.tenantData(id);
      return data.merchantProfiles ||= id==='HS-TEN-001' ? JSON.parse(JSON.stringify(merchantProfileFixtures)) : [];
    }};
})();
