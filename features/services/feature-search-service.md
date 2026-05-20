# Search Service
为FundTracker系统提供搜索功能，为AI辅助能力提供基础设施支持。搜索服务需要满足高性能、可扩展性和准确性的要求，以便用户能够快速找到相关的基金信息和投资建议。

## Search Interface
提供统一的搜索接口。输入包括：
* 查询文本（query text）
* 查询领域（query domain，如基金信息、投资建议等）
* 结果数量限制（max results）

输出为：搜索结果列表。

## Service Provider
搜索服务供应商可以有多个。在实际使用过程中，可以根据优先级来使用，并且提供fallback功能。
* 所有的搜索服务provider都应该实现搜索接口
* 所有的搜索服务provider都应该注册到搜索服务中，并且提供优先级信息，以便搜索服务能够根据优先级来调用不同的provider。
* 所有搜索服务provider的参数设置应该被提取到配置文件中，以便能够灵活调整和管理。配置参数包括但不限于API密钥、查询限制、领域支持等。不同的provider可能需要不同的参数设置，因此配置文件应该能够支持多种provider的参数配置，并且能够根据实际使用情况进行调整。每个参数都有名称，描述，默认值和类型信息。
  * 支持的参数类型有字符串、数字、布尔值等，以满足不同provider的配置需求。
  * 如果需要列表类型的参数，可以使用逗号分隔的字符串来表示，例如：domains参数可以设置为"tech,academic"来表示支持的领域。
  * 敏感信息应该有特定的参数标识。
* 搜索服务根据每个provider的优先级来调用不同的provider，并且提供fallback功能，当一个provider调用失败或者返回结果不满意时，能够自动切换到下一个优先级的provider来继续提供搜索服务。每个搜索服务provider还可以单独设置enabled/disabled状态，以便在需要的时候能够灵活地启用或者禁用某个provider。被disabled的provider将不会被搜索服务调用。
* 具体的搜索服务provider的参数配置界面位于系统配置界面的“搜索服务中”，参见[features/feature-config-management.md](../feature-config-management.md)
### AnySearch
```shell
curl -X POST https://api.anysearch.com/v1/search \
-H "Content-Type: application/json" \
-d '{
"query": "What is quantum computing?",
"domains": ["tech", "academic"],
"max_results": 5
}'

```

### 其他 Provider（待添加）

## 应用场景
### AI辅助
使用AI辅助时，如果所使用的AI大模型本身不支持内置的联网查询功能，但提示词模板又要求使用联网查询以提供更多信息的话，使用本搜索服务来满足提示词模板的需求。搜索服务会根据提示词模板中的查询提示（webSearchHint）和领域要求（本系统都是金融相关的），调用服务来获取相关信息，并将查询结果和提示词模板结合返回给AI大模型，以便其生成更准确和丰富的回答。