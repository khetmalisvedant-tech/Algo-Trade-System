//STL
#include<iostream>
#include<vector>
using namespace std;

// //Array
// //int main(){
// // int Arr[10];
// // for(int k=0;k<10;k++){
// //     Arr[k] = k+2;
// // }
// // cout<<"Array contains: ";
// // for(int k=0;k<10;k++){
// //     cout<<Arr[k]<<" ";
// // }
// // cout<<endl;
// // cout<<Arr[3]<<endl;
// // cout<<Arr[4]<<endl;
// // cout<<sizeof(Arr)<<endl; //1bit = 4bytes in an array . means I box in array contains 4 bytes of value.

// //smallest And Largest number.
// // int arr[10] = {11,11,11,34,54,67,76,80,49,122};
// // int small=arr[0];
// // int large=arr[0];

// // for(int i=0;i<sizeof(arr)/sizeof(arr[0]);i++){
// //     if(arr[i]<=small){
// //         small=i;
// //     }
// //     else if(arr[i]>=large){
// //         large=i;
// //     }

// // }
// //     cout<<"Smallest value is: "<<small<<endl;
// //     cout<<"Largest value is: "<<large<<endl;

// // //pass by referance euqlas to the manupilation of Origial array from its array
// // //and with pass by value it changes the values which is copy of the otiginal value ,
// // but it doesn't change anything in original array

// //two pointer approach
// // int arr[9]= {2,3,6,5,4,4,9,10,21};

// // int n=sizeof(arr)/sizeof(arr[0]);

// // int start=0;
// // int end=n-1;
// //normal loop
// // for(int i=0;i<=n/2;i++){
// //     swap(arr[i],arr[n-i-1]);
// // }

// //diffenent approach
// //while(start<end){
// // swap(arr[start],arr[end]);
// // start++;
// // end--;}

// //for getting output of the array 
// // for(auto x:arr){
// //     cout<<x<<" ";
// // }
// //return 0;

// //HW
// // Sum and product of an array
// void sumAndproduct(int arr[],int n){
//     int sum=0;
//     int product = 1;
//     for(int i=0;i<n-1;i++){
//         sum= sum + arr[i];
//         product = product * arr[i];
//     }
//     cout<<"Sum of array is: "<<sum<<endl;
//     cout<<"Product of an array is: "<<product<<endl;
// }

// // wapping the maximum and minimum element in an array
// void swapminAndmax(int arr[],int n){
// int min=arr[0];
// int max=arr[0];
// for(int i=0;i<n-1;i++){
//     if(arr[i]<=min){
//         min=i;
//     }
//     else if(arr[i]>=max){
//         max=i;
//     }
// }
// swap(arr[min],arr[max]);
// cout<<"After swapping the minimum and maximum element in an array: "<<endl;
// for(int i=0;i<=n-1;i++){
//     cout<<arr[i]<<" ";
// }
// }

// //unique values
// void uniquevalues(int arr[],int n){
// vector <int>unique;
// for(int i=0;i<n;i++){
//     for(int j=i+1;j<n;j++){
//         if(arr[i]==arr[j]){
//             unique.push_back(arr[i]);
            
//         }
//     }
//     }
// for (auto k:unique){
//     cout<<k<<" ";
// }
// }

// //intersection of two arrays
void singleNumber(vector<int>& nums){
    int m  = 0;
    
    
    for(int i=0;i<=nums.size()-1;i++){
        m = m ^ nums[i] ;
    }
  
   cout<<m;
}


int main(){
vector<int> v1 = {4,4,3,1,2,1,2};
singleNumber(v1);
}