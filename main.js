const graphqlToSQL = require('graphql-to-sql')
const makeSqlSchema = graphqlToSQL.makeSqlSchema
const getSchemaDirectives = graphqlToSQL.getSchemaDirectives
const directiveDeclaration = graphqlToSQL.directiveDeclaration
const VerEx = require('verbal-expressions')

// Converts GraphQL scalar definitions -> graphql-to-sql annotated directives
function convertScalarToSQLDirective(schema, identifier, config) {
  const { baseType, directives } = config
  // Capture scalar type and check whether required/optional
  // Passing args to begin/end have no effect. Used for comprehension here.
  const regex = VerEx()
  .beginCapture(`scalar`) 
    .find(identifier)
  .endCapture(`/scalar`)
  .beginCapture(`isRequired`)
    .maybe(`!`)
  .endCapture(`/isRequired`)

  // If passed "String" as identifier, and "String!" was found:
  // Array(3) [ "String!", "String", "!" ]
  const matches = regex.exec(schema)
  if (matches) {
    const [matchedText, scalar, isRequired] = matches
    // If isRequired found (Bang character on type, IE "String!")
    // Then set SQL nullable property accordingly
    directives.nullable = Boolean(isRequired) ? false : true
    // Map through each directive in the configuration
    // Convert to key: value string format and then join results to string
    const directiveString = Object.entries(directives).map(
      // Turn  { type: "BINARY(16)", index: true } into "type: "BINARY(16)", index: "true""
      ([key, value]) => {
        // If the type is a boolean, we need to make sure not to wrap it in quotes, or BOOM!
        const properValueStringFormat = typeof(value) == `boolean` ? value : `"${value}"`
        // This whole method is super disgusting, refactor later
        return `${key}: ${properValueStringFormat}`
      }
    ).join(`, `)

    // Typedef returns format like below:
    // String @sql(type: "TEXT", nullable: true)
    const typdef = `${baseType} @sql(${directiveString})`
    // Replace the original identifier with the converted typedef
    // String! -> String @sql(type: "TEXT", nullable: false)
    return schema.replace(regex, typdef)
  }
  return schema
}

function mapGqlToSqlDirective(schema) {
  const conversionMap = {
    ID: {
      baseType: `Int`,
      directives: {
        primary: true,
        auto: true
      }
    },
    String: {
      baseType: `String`,
      directives: {
        type: `TEXT`
      }
    }
  }
  
  for (let identifier in conversionMap) {
    const config = conversionMap[identifier]
    schema = convertScalarToSQLDirective(schema, identifier, config)
  }
  return schema
}

const schema = `
  type User {
    id: ID!,
    name: String,
    email: String,
    posts: [Post]
  }

  type Post {
    id: ID!
  }
`

const typeDefs = `
  ${directiveDeclaration}
  ${mapGqlToSqlDirective(schema)}
`

const outputFilepath = 'schemaScript.sql'
const directives = getSchemaDirectives()
makeSqlSchema({
  typeDefs,
  schemaDirectives: directives,
  outputFilepath,
  databaseName: 'dbname',
  tablePrefix: 'test_',
})