# Hammerpack

Hammerpack is an opinionated development, test, build, and deployment system for javascript projects. 

Warning: Hammerpack is in the alpha stage. 

## Opinions Matter

Hammerpack is strongly opinionated about the following:

#### 1. Monolithic repositories are better than smaller multiple repositories for each project
If done right, monolithic repositories vastly improve productivity when setting up 
development environments, building projects, sharing code, sharing third-party dependencies, 
code discovery, refactoring, testing, and more.

For example, having one package.json in the root of the repository that covers dependencies
across all projects has the following advantages:

* Update a dependency version across all projects at once, ensuring we don't miss any projects especially in case like
patching security vulnerabilities.
* Allows easier development and debugging patterns, such as knowing what version of a library is being used across
all the deployed services.
* Is easier for legal clearance on dependencies in corporate environments.


#### 2. A monolithic repository can consist of several projects targeting different platforms
You no longer need to have your browser, backend, react-native code in separate repositories. By placing them all
organized in the same repo, you get the advantage of easier code sharing and better understanding of the entire codebase.

Another advantage you will get is faster development and publishing cycles. For example, with Hammerpack you will now be to use 
the same commands for developing, testing, building, deploying, and running any type of project. This means faster
onboarding of new developers, and using the same scripts in your CI/CD pipelines.

When it comes to developing, building, packaging, and deploying the different types of projects, Hammerpack will ensure
there is no leakage of one platform's specific technologies into another platform. This is because Hammerpack
will generate optimized builds for the targeted platforms.


#### 3. You should only build and deploy changes 
Traditionally, the downside of monolithic repositories is that builds would compile all projects, regardless of whether
or not any of the projects have changed. This meant that:

* Build times would be ridiculous for large projects, even when you make a small change.
* All projects would need to have their tests rerun, even if none of their shared code or third-party libraries changed.
* All projects would need to be redeployed, even if none of their shared code or third-party libraries changed.

Hammerpack can detect if there have been any changes to any of the following as compared to previous stages:
* The project's own code
* Shared code the project uses
* Third-party libraries
* Build dependencies (e.g. base Docker images)
* Hammerpack library updates

Hammerpack uses the above data to generate a unique hash, which it then uses to track and determine if it should rebuild, 
retest and redeploy on a per-project basis. This greatly improves CI/CD times.

(This feature is yet to be released)

#### 4. High-coupling is bad
The immediate knee-jerk reaction to monolithic repositories that share code is the concern of high-coupling between
code components. Hammerpack is also of the opinion that high-coupling is bad, and that projects need to define clear code 
boundaries to prevent high-coupling.

This is why Hammerpack takes measures to allow building enforceable code layering constraints. For example, you can tell Hammerpack 
that your `src-web` and `src-ios` folders can use code from `src-shared` and nothing else. Then, any attempts by a 
developer to use code from `src-web` inside the `src-ios` folder will result in errors. 

(This feature is yet to be released)

#### 5. Minimal configuration is good
You should not spend time on configuring tools for development, testing, building, deploying, running. Instead, 
you should focus on your project. 

You should be able to just point Hammerpack to a minimal configuration and it should just work.

## Installation

`npm install -g hammerpack`

## License
MIT
