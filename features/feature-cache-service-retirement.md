# 原有数据缓冲层退出

新增加的几个service封装了对localStorage的操作。为其他模块提供了统一的接口来访问这些需要被持久化的数据。同时也在内存中保留了一个缓存来存储这些数据，以提高访问效率。
* indexService：已经提供了数据缓存功能。
* marketFundService：已经提供了数据缓存功能。
* appDataService：已经提供了数据缓存功能。
* systemConfigService：需要增加类似的数据缓存功能。缓存顶层结构SystemConfig。对localStorage的改动也要反映到缓存中。
* userPreferenceService：需要增加类似的数据缓存功能。缓存顶层结构UserPreference。对localStorage的改动也要反映到缓存中。

## 原有数据缓存层实际
原有数据缓冲层提供了以下四种数据的缓存功能：
- valuationMap  : 实时估值  (ValuationData)
- historyMap    : 历史净值  (HistoricalPoint[])
- intradayMap   : 日内数据  (IntradayPoint[])
- newsCache     : 市场热点  (NewsItem[])

## 替代方案
* 实时估值可以由基金服务（marketFundService）提供
* 历史净值和日内数据可以由指数服务（indexService）和基金服务（marketFundService）提供
* 市场热点可以由一个新的服务（marketNewsService）提供,需要调研一下目前的市场热点数据来源和结构，看是否可以将它们整合到现有的服务中。

## 替换步骤
1. 替换市场热点的数据缓存调用，将其改为调用新的市场热点服务（marketNewsService）。删除原有数据缓冲层中与市场热点相关的缓存逻辑。
2. 替换基金的实时估值数据缓存调用，将其改为调用基金服务（marketFundService）。删除原有数据缓冲层中与实时估值相关的缓存逻辑。
3. 替换基金和指数的日内数据的缓存调用，将其改为调用指数服务（indexService）和基金服务（marketFundService）。删除原有数据缓冲层中与日内数据相关的缓存逻辑。
4. 替换基金和指数的历史净值数据的缓存调用，将其改为调用指数服务（indexService）和基金服务（marketFundService）。删除原有数据缓冲层中与历史净值相关的缓存逻辑。
5. 最后，删除原有数据缓冲层的代码，因为它已经不再提供任何缓存功能了。