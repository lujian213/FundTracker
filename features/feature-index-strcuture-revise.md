# 指数数据结构，缓存和持久化设计优化

## 数据结构
* 增加一个结构代表指数基本信息（IndexInfo）:
  * 包含目前MarketIndex的内容
* 将MarketIndex改造成顶层结构，包含以下内容：
  * IndexInfo：指数基本信息
  * HistoricalPoint[]:历史数据点数组
## 缓存设计
* 缓存中保留2个key来存贮代表国内指数和国外指数的数据。
  * 建议使用有序map来存储指数数据，key为指数代码，value为MarketIndex对象。这样既能方便根据指数代码快速访问数据，又能保持数据的有序性，便于后续的展示和分析。
## 持久化设计
  * 在localStorage中，保留2个key来存储代表国内指数和国外指数的IndexInfo列表。
## 服务层（service）设计
  * 提供服务层为其他模块提供接口来使用缓存和操作localStorage。
