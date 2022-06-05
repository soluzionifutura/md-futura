# test 3

[test1](../test1.md)

```js
const axios = require("axioks")
axios.get("https://jsonplaceholder.typicode.com/todos/1")
  .then(res => console.log(res.data))
  .catch(err => console.log(err.status))
```
