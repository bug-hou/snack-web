const services = [
  {
    id: 'express', title: '快递代取', shortTitle: '快递代取',
    subtitle: '少跑一趟，轻松到家', icon: 'package-open', label: '帮我取',
    description: '忙着上班，或不想下楼？把取件这件小事交给社区服务。',
    steps: [
      { title: '填写取件信息', description: '选择快递站点，填写取件码与包裹数量。' },
      { title: '确认费用与时间', description: '确认包裹大小、代取费用和送达安排后再下单。' },
      { title: '送到约定地点', description: '按约定送达，处理进度在服务订单中查看。' }
    ],
    rules: [
      { title: '费用与范围', description: '代取收费、覆盖站点及服务时间尚未确定，正式开放前会明确展示。' },
      { title: '保护取件信息', description: '不要在公开区域填写取件码、手机号或完整门牌号；服务开通后仅向授权处理者提供。' },
      { title: '特殊包裹先确认', description: '大件、易碎、生鲜及需要本人签收的包裹，需先确认是否可以代取。' }
    ]
  },
  {
    id: 'purchase', title: '京东便利店代买', shortTitle: '便利店代买',
    subtitle: '日常所需，顺路带回', icon: 'shopping-bag', label: '帮我买',
    description: '饮料、零食、日用品，把想买的列成清单，少一趟来回。',
    steps: [
      { title: '列出代买清单', description: '写清商品、规格和数量，选择是否接受同类替换。' },
      { title: '确认价格与服务费', description: '商品金额与代买服务费分别确认，不在缺货时擅自替换。' },
      { title: '购入并送达', description: '按确认清单购买，保留购买凭证，送至约定地点。' }
    ],
    rules: [
      { title: '非京东官方服务', description: '本项目是社区代买服务，不是京东官方小程序；尚未接入京东商品或订单系统。' },
      { title: '门店与价格', description: '合作门店、代买范围及服务费尚待确认；商品库存与售价以实际门店为准。' },
      { title: '现货与代买分开', description: '首页“便利铺现货”属于原有小店商品，不是京东便利店实时商品目录。' }
    ]
  },
  {
    id: 'secondhand', title: '二手物品分享', shortTitle: '二手物品分享',
    subtitle: '闲置流转，好物接力', icon: 'repeat-2', label: '邻里分享',
    description: '让用不上的好物找到新主人。二手转让，也可以免费送给邻居。',
    steps: [
      { title: '拍照介绍物品', description: '使用实物照片，写清成色、使用情况及已知瑕疵。' },
      { title: '选择分享方式', description: '二手转让或免费分享，价格与交接方式清楚标注。' },
      { title: '约好地点交接', description: '确认物品状态，在小区公共区域见面交接。' }
    ],
    rules: [
      { title: '真实描述', description: '仅发布本人有权处置的物品，说明瑕疵，不使用误导性图片和描述。' },
      { title: '保护邻里隐私', description: '物品介绍和图片中不要公开手机号、取件码或完整门牌号。' },
      { title: '安全交接', description: '建议白天在公共区域交接并当面检查；不提供资金托管或平台交易担保。' }
    ]
  }
];

module.exports = { services };
