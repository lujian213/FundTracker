# 提示词模板服务改造
现在有好几个地方都用到了提示词模板，但格式以及类型定义都不太一样，导致代码里有很多针对不同模板的特殊处理逻辑。我们需要统一一下格式和类型定义，简化代码逻辑，提高可维护性。在promptTemplateService里面做一些调整，来适应新的格式和类型定义。promptTemplateService作为一个专门负责管理提示词模板的服务，应该提供统一的接口来获取不同类型的提示词模板内容。我们需要对它进行一些调整，以适应新的格式和类型定义。以下是具体的改造方案：

## 类型定义
* 不需要基础模板接口BasePromptTemplate，直接用标准提示词模板PromptTemplate，也不需要其他类型了，直接用PromptTemplate就行了，减少不必要的类型层级。
* 用这个结构来代表所有的提示词模板中的内容。
* 提示词模板文件格式统一成如下结构，去掉多余的字段，简化配置文件。其中maxTokens和temperature是可选的，如果不配置就使用默认值。enabled默认是true，如果不配置就认为是启用的。description是可选的，可以用来描述这个模板的用途，但不影响功能。type是可选的，默认为null。只有在common-questions中才有这个字段，因为common-questions里面的模板的内容是会改变的，不能把id写死在代码里，需要用到type来查询对应的模板。其他的模板都不需要type字段，直接用id来区分不同的模板就行了。
```json
{
  "templates": [
    {
      "id": "investment-draft-analysis",
      "name": "投资计划分析",
      "description": "分析今日投资计划的合理性和风险",
      "type": "some type",
      "maxTokens": 2000,
      "temperature": 0,
      "enabled": true,
      "template": "请分析我今天的基金投资计划。以下是结构化数据（JSON格式），请自行联网搜索获取的今日及近期重大财经新闻、宏观事件，给出操作合理性分析和风险提示。\n\n输出：以表格形式给出每个基金的名称（不包含基金代码），操作（买入为绿色，卖出为红色），份额，估算金额，合理性（合理/不合理/中性）、建议，风险提示（如有）。\n\n## JSON数据说明\n{json_schema}\n\n## 我的投资计划数据\n```json\n{json_content}\n```"
    },
    ...
  ]
}
```
  * 所有模板里面的id必须是唯一的，作为模板的唯一标识。
  * background-job-prompts.json中的type字段是多余的，可以移除，直接用id来区分不同的后台任务模板。格式需要调整。
  * common-questions中(包括fund和index)的格式改成和其他模板一致。type字段是必须的，而且同一个文件里面的type都是一样的。因为common-questions里面的模板内容是会改变的，不能把id写死在代码里，需要用到type来查询对应的模板。其他的模板都不需要type字段，直接用id来区分不同的模板就行了。
  * 唯一有不一样的是ai-fund-prompt-templates.json和ai-index-prompt-templates.json这两个文件。它们内部可以有多个模板，但是只能有一个enabled为true的模板，其他的都必须是false或者不配置（默认false）。要把id,name,description提取到外面，作为固定的标识。不管哪个enable，在代码里面操作的永远是固定的id。从这两个模板读取的内容最终分别只有那条被enable的。 格式如下：
```json
{
  "id": "fund-analysis-welcome-message",
  "name": "欢迎消息",
  "description": "AI助手首次打开时的欢迎消息",
  "templates": [
    {
      "enabled": false,
      "template": "欢迎使用AI投资助手！我是您的专业投资顾问，可以为您分析{code}（{name}）的相关信息。\n\n基金基本信息：\n- 满仓份额：{fullCapacity}\n- 初始份额：{initialCapacity}\n- 起始日期：{initialDate}\n- 初始价格：{initialPrice}\n\n投资历史：\n{history}\n\n您可以问我任何关于这只基金的问题，比如它的表现、风险或市场前景，我会根据最新信息为您提供专业建议。"
    },
    {
      "enabled": true,
      "template": "请你扮演一个专业的投资顾问，详细分析这只基金（基金代码：{code}，基金名称：{name}）。\n\n基金基本信息：\n- 满仓份额：{fullCapacity}\n- 初始份额：{initialCapacity}\n- 起始日期：{initialDate}\n- 初始价格：{initialPrice}\n\n当前行情：\n- 当前价格：{currentPrice}（{currentDate}）\n- 前值：{previousPrice}（{previousDate}）\n- 涨跌幅：{rate}\n\n持仓情况：\n- 市场价值：{marketValue}\n- 当前仓位：{position} 份\n- 仓位占比：{positionRate}\n- 整体盈利：{profit}\n- 平均成本价：{avgCostPrice}\n\n交易历史：\n{history}\n\n请结合当前国内外市场情况、政治经济形势、行业发展等，帮我分析这只基金的表现、未来的机会和潜在风险。"
    },
    {
      "enabled": false,
      "template": "请分析这只基金（基金代码：{code}，基金名称：{name}）的过往业绩表现。\n\n基金配置：\n- 满仓份额：{fullCapacity}\n- 初始份额：{initialCapacity}\n- 起始日期：{initialDate}\n- 初始价格：{initialPrice}\n\n交易记录：\n{history}\n\n请评估这只基金的投资价值和历史收益率。"
    },
    {
      "enabled": false,
      "template": "请评估这只基金（基金代码：{code}，基金名称：{name}）的投资风险。\n\n持仓信息：\n- 满仓份额：{fullCapacity}\n- 初始份额：{initialCapacity}\n- 起始日期：{initialDate}\n- 初始价格：{initialPrice}\n\n交易记录：\n{history}\n\n请识别这只基金的主要风险因素并提供风险缓解建议。"
    },
    {
      "enabled": false,
      "template": "请从市场角度分析这只基金（基金代码：{code}，基金名称：{name}）的前景。\n\n投资情况：\n- 满仓份额：{fullCapacity}\n- 初始份额：{initialCapacity}\n- 起始日期：{initialDate}\n- 初始价格：{initialPrice}\n\n投资历史：\n{history}\n\n请提供市场趋势分析和投资策略建议。"
    },
    {
      "enabled": false,
      "template": "基于以下信息，请提供这只基金（基金代码：{code}，基金名称：{name}）的投资建议。\n\n配置信息：\n- 满仓份额：{fullCapacity}\n- 初始份额：{initialCapacity}\n- 起始日期：{initialDate}\n- 初始价格：{initialPrice}\n\n交易历史：\n{history}\n\n请告诉我是否应该增持、减持或继续持有，并解释理由。"
    }
  ]
}
```    
## promptTemplateService
  * 不管文件里面怎么表示，在promptTemplateService中读取回来后都是用PromptTemplate来表示的。可以缓存为一个map，key是id，value是PromptTemplate对象。
  * 缓存策略简单化。不需要过期设置。只在页面刷新时，load一次。以后都使用缓存的内容。
  * 对其他模块开放的查询接口主要有2个：
    * 根据id查询：主要针对那些id是固定的模板，比如基金分析的欢迎消息，投资计划分析等。调用方只需要知道这个id，就可以获取到对应的模板内容。id的常量在promptTemplateService中定义，调用方通过导入这个常量来使用，避免硬编码字符串。
    * 根据type来查询：主要针对common-questions里面的模板。因为common-questions里面的模板内容是会改变的，不能把id写死在代码里，需要用到type来查询对应的模板。调用方只需要知道这个type，就可以获取到对应的模板列表。type的常量在promptTemplateService中定义，调用方通过导入这个常量来使用，避免硬编码字符串。
  * 变量填充功能：可以把接口做得通用一点，比如接受一个map，来应对不同的场景。map内容由调用方来决定。
